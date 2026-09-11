import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { uploadRatelimit } from "@/lib/redis";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isTeamMemberOfEither } from "@/lib/membership";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The instrument the parties actually signed.
 *
 * A closed amount is whatever the pair typed, and both of them typing it does
 * not make it true: a pair with a shared interest in a smaller fee can agree a
 * smaller number together. The SAFE, note or subscription agreement they signed
 * states the real one, and unlike the amount field it was not written for us.
 *
 * Uploading it is the party's own act, which is why 125 left instrument_doc_url
 * out of the deals_verdicts_server_only trigger while guarding the figure read
 * out of it. The write below still goes through the service-role client, for a
 * reason the column list does not show: deals_participant only matches the two
 * OWNER rows, so a team member allowed to close a deal (and therefore to state
 * its amount) could not record the document behind that amount with a client
 * key. The party check above the write is what authorises it.
 *
 * What the row stores is the bucket-relative PATH, never a signed URL. A signed
 * URL living in a column is a long-lived credential that nothing can claw back;
 * the GET below mints a sixty-second one per read instead, the same lesson
 * app/api/documents/open exists to carry.
 */

/** Shared with the deal room's own uploads. The instrument sits under its own
 *  prefix so it is never listed among them: those are row-driven, this is one
 *  fixed file per deal. */
const BUCKET = "deal-documents";
const MAX_BYTES = 10 * 1024 * 1024;

/** Same sixty seconds app/api/documents/open mints. Long enough to open, short
 *  enough that a forwarded link is dead on arrival. */
const VIEW_URL_SECONDS = 60;

/** One instrument per deal, at a fixed key. A replacement supersedes it rather
 *  than stacking versions for a reviewer to guess between. */
function instrumentPath(dealId: string): string {
  return `deals/${dealId}/instrument.pdf`;
}

/** Rows written by this route hold the bare path. A full URL is only possible
 *  if something outside this lane ever wrote the column, and reading one back
 *  as a path would 404 the download rather than say why. */
function storagePathFrom(stored: string): string | null {
  if (!/^https?:\/\//.test(stored)) return stored || null;
  const m = stored.match(new RegExp(`/object/sign/${BUCKET}/([^?]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// One unbroken literal. supabase-js infers the row shape from the TEXT of this
// string, so splitting it with + widens the type to `string` and every field
// comes back as GenericStringError instead of its real type.
const DEAL_COLUMNS =
  "id, startup_id, investor_id, amount, currency, instrument_doc_url, instrument_doc_extracted_amount, reconciliation_status, startup:startups(owner_id), investor:investors(owner_id)";

type OwnerJoin = { owner_id: string | null } | null;

type Party = "startup" | "investor" | null;

interface DealRow {
  id: string;
  startup_id: string;
  investor_id: string;
  amount: number | null;
  currency: string;
  instrument_doc_url: string | null;
  instrument_doc_extracted_amount: number | null;
  reconciliation_status: string;
  startup: unknown;
  investor: unknown;
}

/**
 * The deal, and the caller's standing on it.
 *
 * `party` is null for an admin, who may read the panel for oversight but is
 * never the one who signed the document.
 */
async function loadDeal(
  admin: ReturnType<typeof createAdminClient>,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  dealId: string,
  userId: string,
): Promise<{ ok: true; deal: DealRow; party: Party } | { ok: false; response: NextResponse }> {
  const { data, error } = await admin
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("id", dealId)
    .maybeSingle();

  // "Not found" is a fact about the ledger. A failed read must not borrow it:
  // a party acts on that answer by concluding their deal is gone.
  if (error) {
    console.error("[deals/instrument:read]", error);
    return { ok: false, response: NextResponse.json({ error: "Could not read the deal" }, { status: 500 }) };
  }
  if (!data) {
    return { ok: false, response: NextResponse.json({ error: "Deal not found" }, { status: 404 }) };
  }

  const deal = data as unknown as DealRow;
  const startupOwner = (deal.startup as OwnerJoin)?.owner_id ?? null;
  const investorOwner = (deal.investor as OwnerJoin)?.owner_id ?? null;

  let party: Party = null;
  if (startupOwner === userId) party = "startup";
  else if (investorOwner === userId) party = "investor";

  // A team member works the account's deals and may close one, so they may also
  // file the document behind the amount they closed at. Asked one side at a
  // time: which side they are on decides what the room shows them, and the
  // combined helper answers only whether they are on either.
  if (!party && await isTeamMemberOfEither(userId, deal.startup_id, null)) party = "startup";
  if (!party && await isTeamMemberOfEither(userId, null, deal.investor_id)) party = "investor";

  let isAdmin = false;
  if (!party) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profileError) {
      console.error("[deals/instrument:role]", profileError);
      return { ok: false, response: NextResponse.json({ error: "Could not read your account" }, { status: 500 }) };
    }
    isAdmin = profile?.role === "admin";
  }

  if (!party && !isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, deal, party };
}

// ── What the room shows, and the document itself ─────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = params.id;
  if (!isUuid(dealId)) return NextResponse.json({ error: "Bad deal id" }, { status: 400 });

  const admin = createAdminClient();
  const loaded = await loadDeal(admin, supabase, dealId, user.id);
  if (!loaded.ok) return loaded.response;
  const { deal, party } = loaded;

  // ?open=1 -- the panel links straight here rather than holding a URL of its
  // own. The browser only ever carries this path, so every click re-runs the
  // checks above as whoever clicked, and the credential it redirects to is a
  // minute old. A URL handed out in a JSON body is stale by the time anyone
  // presses it and still works for anyone it was forwarded to.
  if (req.nextUrl.searchParams.get("open") === "1") {
    const openPath = deal.instrument_doc_url ? storagePathFrom(deal.instrument_doc_url) : null;
    if (!openPath) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: signed, error: signError } = await admin.storage
      .from(BUCKET).createSignedUrl(openPath, VIEW_URL_SECONDS);
    if (signError || !signed?.signedUrl) {
      console.error("[deals/instrument:sign]", signError);
      return NextResponse.json({ error: "File missing" }, { status: 404 });
    }
    return NextResponse.redirect(signed.signedUrl, 302);
  }

  return NextResponse.json({
    party,
    canUpload: !!party,
    hasInstrument: !!deal.instrument_doc_url,
    status: deal.reconciliation_status,
    declaredAmount: deal.amount === null ? null : Number(deal.amount),
    declaredCurrency: deal.currency,
    // The currency of this one is not stored -- 125 added a numeric column and
    // no companion for it -- so the panel presents it as a figure read off the
    // page and never asserts a currency it cannot prove.
    extractedAmount: deal.instrument_doc_extracted_amount === null
      ? null
      : Number(deal.instrument_doc_extracted_amount),
  });
}

// ── The upload ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const dealId = params.id;
  if (!isUuid(dealId)) return NextResponse.json({ error: "Bad deal id" }, { status: 400 });

  const { success: withinRate } = await uploadRatelimit.limit(`instrument:${user.id}`);
  if (!withinRate) {
    return NextResponse.json(
      { error: "Too many uploads. Try again shortly.", messageKey: "instrument.tooMany" },
      { status: 429 },
    );
  }

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "multipart/form-data body required" }, { status: 400 }); }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "File required", messageKey: "instrument.fileMissing" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is over 10 MB.", messageKey: "instrument.tooLarge" }, { status: 413 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "The instrument must be a PDF.", messageKey: "instrument.pdfOnly" }, { status: 415 });
  }

  const admin = createAdminClient();
  const loaded = await loadDeal(admin, supabase, dealId, user.id);
  if (!loaded.ok) return loaded.response;
  // Signing is the parties' act and so is producing what they signed. An admin
  // reads this panel; they do not file a document into it on someone's behalf.
  if (!loaded.party) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bytes = await file.arrayBuffer();
  // The declared MIME type is whatever the browser guessed from the extension,
  // so a renamed file arrives as a PDF and fails later inside the parser, where
  // "no text" reads as a scan rather than as the wrong file. The header is the
  // one cheap check that tells those two apart. Producers put junk in front of
  // it often enough that it is searched for rather than required at offset 0.
  const head = Buffer.from(bytes.slice(0, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) {
    return NextResponse.json({ error: "That file is not a PDF.", messageKey: "instrument.pdfOnly" }, { status: 415 });
  }

  const path = instrumentPath(dealId);
  const replacing = !!loaded.deal.instrument_doc_url;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    console.error("[deals/instrument:upload]", uploadError);
    return NextResponse.json({ error: "Upload failed. Try again.", messageKey: "instrument.uploadFailed" }, { status: 500 });
  }

  // A new document supersedes every reading of the old one. Leaving a verdict
  // and a figure that belong to a file nobody can open any more would show a
  // party a mismatch against a page that is gone -- and would leave an admin
  // clearance standing over a document its reviewer never saw. Clearing a
  // mismatch here is not an escape: the notification raised at the time is the
  // durable record, and this column only ever says what is true right now.
  const { data: saved, error: saveError } = await admin
    .from("deals")
    .update({
      instrument_doc_url: path,
      instrument_doc_extracted_amount: null,
      reconciliation_status: "pending",
    })
    .eq("id", dealId)
    .select("id");

  if (saveError || !saved || saved.length === 0) {
    if (saveError) console.error("[deals/instrument:record]", saveError);
    // A first upload that failed to record leaves a file nobody can reach, so
    // the bytes go back out. A REPLACEMENT must not: the row already points at
    // this key, the upsert above has already put the new document there, and
    // deleting it would leave the deal pointing at nothing at all. The stale
    // verdict beside it is the lesser wrong, and the retry fixes it.
    if (!replacing) await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: "Could not record the document.", messageKey: "instrument.uploadFailed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    hasInstrument: true,
    status: "pending",
    declaredAmount: loaded.deal.amount === null ? null : Number(loaded.deal.amount),
    declaredCurrency: loaded.deal.currency,
  });
}
