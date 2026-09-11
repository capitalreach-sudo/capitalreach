import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { extractInstrumentAmount, isOpenAIConfigured } from "@/lib/openai";
import { pdfBufferToText } from "@/lib/doc-text";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isTeamMemberOfEither } from "@/lib/membership";
import { notifyUsers } from "@/lib/notify-user";
import { aiRatelimit } from "@/lib/redis";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The model SDK bounds itself at 45 seconds (lib/openai.ts). A function
 *  ceiling under that turns a slow read into a platform timeout with no
 *  response body, which the panel cannot tell apart from a refusal. */
export const maxDuration = 60;

/**
 * Reading the signed instrument, and saying whether it agrees.
 *
 * THE FAILURE THAT MATTERS MOST HERE IS NOT A MISSED MISMATCH. It is telling a
 * founder their round disagrees with their own paperwork because their PDF is a
 * scan, or is typeset badly, or was exported by something the parser does not
 * understand. None of those is evidence about the round. So there are three
 * outcomes, not two: agrees, disagrees, and could not be read -- and everything
 * short of a figure read clearly lands on the third, which asks for a better
 * file and accuses nobody.
 *
 * The verdict columns carry the 125 guard trigger, so they are written with the
 * service-role client and only from behind the checks below. The party being
 * checked cannot mark their own round matched, and cannot clear a mismatch.
 *
 * Nothing here suspends, invoices or strikes. A mismatch raises a notification
 * that puts both figures in front of both parties and in front of an admin,
 * because the single most likely cause of one is a typo in a number somebody
 * entered months ago, and the person who can fix that is a party to the deal.
 */

const BUCKET = "deal-documents";

/** Rounds are entered rounded, filed to the cent, and re-cut for fees and
 *  costs. Five percent is wide enough that none of that reads as a
 *  disagreement, and narrow enough that an order-of-magnitude understatement
 *  cannot hide inside it. */
const TOLERANCE = 0.05;

/**
 * How clearly the document has to name a figure before either verdict is
 * recorded.
 *
 * Deliberately the same bar for 'matched' as for 'mismatch'. A threshold that
 * clears easily and accuses reluctantly is still a threshold that gets the
 * reading wrong -- it just gets it wrong in the direction where nobody
 * complains. The model's own prompt puts an unsure reading below 0.5; this
 * sits above that, so "several amounts and I cannot tell which" never becomes
 * a finding about a person.
 */
const MIN_CONFIDENCE = 0.7;

/** Rows are written holding the bucket-relative path. A stored URL is handled
 *  so a value written outside this lane downloads rather than 404s. */
function storagePathFrom(stored: string): string | null {
  if (!/^https?:\/\//.test(stored)) return stored || null;
  const m = stored.match(new RegExp(`/object/sign/${BUCKET}/([^?]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// One unbroken literal. supabase-js infers the row shape from the TEXT of this
// string, so splitting it with + widens the type to `string` and every field
// comes back as GenericStringError instead of its real type.
const DEAL_COLUMNS =
  "id, startup_id, investor_id, amount, currency, instrument_doc_url, reconciliation_status, startup:startups(name, owner_id), investor:investors(owner_id, display_name, firm_name)";

type StartupJoin = { name: string | null; owner_id: string | null } | null;
type InvestorJoin = { owner_id: string | null; display_name: string | null; firm_name: string | null } | null;

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString()}`;
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const dealId = params.id;
  if (!isUuid(dealId)) return NextResponse.json({ error: "Bad deal id" }, { status: 400 });

  // Keyed on the deal, not the caller. The same document read twice costs the
  // same and says the same thing, and two parties re-running it in turn must
  // not buy twice the budget.
  const { success: withinRate } = await aiRatelimit.limit(`reconcile:${dealId}`);
  if (!withinRate) {
    return NextResponse.json(
      { error: "That was just checked. Try again in a minute.", messageKey: "instrument.tooMany" },
      { status: 429 },
    );
  }

  const admin = createAdminClient();

  const { data, error: dealError } = await admin
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("id", dealId)
    .maybeSingle();

  if (dealError) {
    console.error("[deals/reconcile:read]", dealError);
    return NextResponse.json({ error: "Could not read the deal" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const deal = data as unknown as {
    id: string;
    startup_id: string;
    investor_id: string;
    amount: number | null;
    currency: string;
    instrument_doc_url: string | null;
    reconciliation_status: string;
    startup: unknown;
    investor: unknown;
  };
  const startup = deal.startup as StartupJoin;
  const investor = deal.investor as InvestorJoin;

  let isParty = startup?.owner_id === user.id || investor?.owner_id === user.id;
  if (!isParty) isParty = await isTeamMemberOfEither(user.id, deal.startup_id, deal.investor_id);

  // An admin may re-run the read for oversight -- typically right after a party
  // replaces a scan with a text-based export -- which is why this differs from
  // the upload, where filing the document is the parties' own act.
  let isAdmin = false;
  if (!isParty) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileError) {
      console.error("[deals/reconcile:role]", profileError);
      return NextResponse.json({ error: "Could not read your account" }, { status: 500 });
    }
    isAdmin = profile?.role === "admin";
  }
  if (!isParty && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const declaredAmount = deal.amount === null ? null : Number(deal.amount);
  const declaredCurrency = deal.currency;

  const path = deal.instrument_doc_url ? storagePathFrom(deal.instrument_doc_url) : null;
  if (!path) {
    return NextResponse.json(
      { error: "Upload the signed instrument first.", messageKey: "instrument.noDocument" },
      { status: 409 },
    );
  }

  /**
   * The verdict, and only the verdict.
   *
   * reconciliation_status is only ever written to a real finding. Every other
   * outcome leaves the column exactly as it stands, because "we could not read
   * it this time" must not quietly downgrade a mismatch recorded against the
   * same unchanged document, nor undo an admin's clearance. A fresh upload is
   * the one thing that resets it, and that route does so itself.
   */
  async function record(patch: {
    instrument_doc_extracted_amount?: number | null;
    reconciliation_status?: "matched" | "mismatch";
  }): Promise<string | null> {
    const { error } = await admin.from("deals").update(patch).eq("id", dealId);
    if (error) {
      console.error("[deals/reconcile:write]", error);
      return "Could not record the reading.";
    }
    return null;
  }

  // No model key on this deployment. The document is on file and the reading
  // can be run later; saying so is honest and is not a 500.
  if (!isOpenAIConfigured) {
    return NextResponse.json({
      status: deal.reconciliation_status,
      read: false,
      messageKey: "instrument.resultModelOff",
      message: "Reading the instrument is not configured on this deployment, so the document is on file unchecked.",
      declaredAmount,
      declaredCurrency,
      extractedAmount: null,
      extractedCurrency: null,
    });
  }

  const download = await admin.storage.from(BUCKET).download(path);
  if (download.error || !download.data) {
    // The file is ours to serve. Failing to reach it says nothing about the
    // document and must never read as one.
    console.error("[deals/reconcile:download]", download.error);
    return NextResponse.json(
      { error: "The stored instrument could not be opened.", messageKey: "instrument.storageFailed" },
      { status: 500 },
    );
  }

  let text = "";
  try {
    text = await pdfBufferToText(Buffer.from(await download.data.arrayBuffer()));
  } catch (err) {
    // A parser that throws and a PDF with no text layer are the same finding:
    // there is nothing here to read.
    console.error("[deals/reconcile:parse]", err);
  }

  if (!text) {
    return NextResponse.json({
      status: deal.reconciliation_status,
      read: false,
      messageKey: "instrument.resultUnreadable",
      message: "No text could be read from that PDF -- it looks like a scan or an image. Upload a text-based export of the same document and this will read it.",
      declaredAmount,
      declaredCurrency,
      extractedAmount: null,
      extractedCurrency: null,
    });
  }

  let reading: { amount: number | null; currency: string | null; confidence: number };
  try {
    reading = await extractInstrumentAmount(text);
  } catch (err) {
    // A refused, empty or unparseable answer is the model failing, not the
    // founder. Kept apart from an unclear document below because the two ask
    // for opposite things: this one asks for patience, that one asks for a
    // different file, and telling a founder to re-export a perfectly good PDF
    // because an upstream hiccuped is its own small accusation.
    console.error("[deals/reconcile:extract]", err);
    return NextResponse.json({
      status: deal.reconciliation_status,
      read: false,
      messageKey: "instrument.resultReadFailed",
      message: "The instrument could not be read just now. Nothing has been recorded against this deal; try again shortly.",
      declaredAmount,
      declaredCurrency,
      extractedAmount: null,
      extractedCurrency: null,
    });
  }

  // A figure at low confidence is not a quiet figure, it is an unread one, and
  // it is not written to the column an admin queue reads as fact.
  if (reading.amount === null || reading.confidence < MIN_CONFIDENCE) {
    return NextResponse.json({
      status: deal.reconciliation_status,
      read: false,
      messageKey: "instrument.resultUnclear",
      message: "No single investment amount could be read clearly from that document. A text-based PDF of the executed instrument reads best.",
      declaredAmount,
      declaredCurrency,
      extractedAmount: null,
      extractedCurrency: null,
    });
  }

  const extractedAmount = reading.amount;
  const extractedCurrency = reading.currency;

  // The reading itself is worth keeping even where it settles nothing: it is a
  // figure taken off the page rather than supplied by a party, which is the
  // whole point of the column.
  const writeError = await record({ instrument_doc_extracted_amount: extractedAmount });
  if (writeError) return NextResponse.json({ error: writeError }, { status: 500 });

  if (declaredAmount === null || declaredAmount <= 0) {
    return NextResponse.json({
      status: deal.reconciliation_status,
      read: true,
      messageKey: "instrument.resultNoDeclared",
      message: "The instrument was read, but this deal carries no amount to compare it against yet.",
      declaredAmount,
      declaredCurrency,
      extractedAmount,
      extractedCurrency,
    });
  }

  // A figure with no currency on the page compares against nothing: 250,000 is
  // not a number until it says which 250,000 it is. Recorded, not judged.
  if (!extractedCurrency) {
    return NextResponse.json({
      status: deal.reconciliation_status,
      read: true,
      messageKey: "instrument.resultNoCurrency",
      message: "The instrument names an amount but no currency, so it cannot be compared with the amount on the deal.",
      declaredAmount,
      declaredCurrency,
      extractedAmount,
      extractedCurrency: null,
    });
  }

  const sameCurrency = extractedCurrency === declaredCurrency.toUpperCase();
  const withinTolerance = Math.abs(extractedAmount - declaredAmount) <= declaredAmount * TOLERANCE;
  // Both halves required. 250,000 USD against 250,000 EUR is two different
  // rounds and two different fees, however close the digits look.
  const matched = sameCurrency && withinTolerance;

  // An admin who has looked at both figures and cleared the deal outranks this
  // read. Without the guard, either party pressing Check against the same
  // unchanged document walks 'admin_cleared' back to 'mismatch' and re-raises
  // the alert, so the machine would overturn a human decision on a loop. The
  // extracted figure is still recorded; only the verdict is left alone.
  // The verdict write is SKIPPED rather than sent as an empty patch: the
  // extracted figure already landed above, and PostgREST rejects an update
  // with no columns in it.
  const cleared = deal.reconciliation_status === "admin_cleared";
  if (!cleared) {
    const verdictError = await record({ reconciliation_status: matched ? "matched" : "mismatch" });
    if (verdictError) return NextResponse.json({ error: verdictError }, { status: 500 });
  }

  if (cleared) {
    return NextResponse.json({
      status: "admin_cleared",
      read: true,
      messageKey: "instrument.resultCleared",
      message: "An administrator has already reviewed this deal and cleared it. The reading below is recorded but does not change that.",
      declaredAmount,
      declaredCurrency,
      extractedAmount,
      extractedCurrency,
    });
  }

  if (matched) {
    return NextResponse.json({
      status: "matched",
      read: true,
      messageKey: "instrument.resultMatched",
      message: "The signed instrument agrees with the amount on this deal.",
      declaredAmount,
      declaredCurrency,
      extractedAmount,
      extractedCurrency,
    });
  }

  // ── A disagreement, put in front of the people who can explain it ─────────
  // Both figures, to both parties and to an admin. The likeliest cause is a
  // number mistyped months ago, and only a party can correct that. No account
  // is suspended, no fee is raised and no strike is recorded here; what follows
  // is a person reading two numbers.
  //
  // Only on the transition. A party re-running the read against the same
  // unchanged document must not put the same alert in front of an admin five
  // times, after which nobody reads any of them.
  if (deal.reconciliation_status !== "mismatch") {
    const declaredText = money(declaredAmount, declaredCurrency);
    const extractedText = money(extractedAmount, extractedCurrency);
    const companyName = startup?.name ?? "this deal";

    // The type union is fixed by a CHECK constraint on notifications (024), so
    // this borrows the type the close handshake already uses for "something on
    // your deal needs you" rather than inventing one a migration would have to
    // add.
    await notifyUsers([startup?.owner_id, investor?.owner_id], {
      type: "deal_stage",
      title: "The signed instrument does not match the amount on record",
      titleKey: "instrument.notifyTitle",
      body: `${declaredText} on the deal, ${extractedText} in the document.`,
      bodyKey: "instrument.notifyBody",
      params: { declared: declaredText, extracted: extractedText },
      href: `/deals?deal=${dealId}`,
    });

    const { data: admins, error: adminsError } = await admin
      .from("profiles").select("id").eq("role", "admin").limit(20);
    if (adminsError) console.error("[deals/reconcile:admins]", adminsError);
    const adminIds = (admins ?? []).map((a) => a.id);
    if (adminIds.length) {
      await notifyUsers(adminIds, {
        type: "admin_alert",
        title: `Instrument mismatch: ${companyName}`,
        body: `${declaredText} declared, ${extractedText} read from the signed instrument.`,
        href: `/deals?deal=${dealId}`,
      });
    }
  }

  return NextResponse.json({
    status: "mismatch",
    read: true,
    messageKey: sameCurrency ? "instrument.resultMismatch" : "instrument.resultCurrencyMismatch",
    message: sameCurrency
      ? "The signed instrument states a different amount from the one recorded on this deal."
      : "The signed instrument states a different currency from the one recorded on this deal.",
    declaredAmount,
    declaredCurrency,
    extractedAmount,
    extractedCurrency,
  });
}
