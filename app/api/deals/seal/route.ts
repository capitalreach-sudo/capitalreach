import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isTeamMemberOfEither } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import {
  DEAL_SEAL_VERSION, dealSealText, sealHash, sealState, type SealParty,
} from "@/lib/deal-seal";

/**
 * Signing the deal.
 *
 * GET hands back the exact document to be signed plus who has signed so far.
 * POST records one signature. The second one seals the deal, which is what
 * opens the conversation and stops masking the pair's contact details.
 *
 * The document is RENDERED on both requests from the deal's own row rather
 * than stored between them, and the signature stores a hash of what was
 * rendered. That is the whole evidentiary point: if the terms changed between
 * the two signatures, the hashes differ and the seal does not complete, which
 * is the correct outcome rather than a bug to route around.
 */

async function partyFor(userId: string, deal: { startup_id: string; investor_id: string }): Promise<SealParty | null> {
  // Checked against THIS deal's entities, never against whichever entity
  // resolveEntity lands on first: that resolver returns a user's first owned
  // row, so a founder's second startup 404'd its own seal.
  const admin = createAdminClient();
  const [{ data: ownsStartup }, { data: ownsInvestor }] = await Promise.all([
    admin.from("startups").select("id").eq("id", deal.startup_id).eq("owner_id", userId).maybeSingle(),
    admin.from("investors").select("id").eq("id", deal.investor_id).eq("owner_id", userId).maybeSingle(),
  ]);
  // A startup seat wins a tie, the same way it does in the message routes: a
  // founder who also holds an investor profile is still the company here.
  if (ownsStartup) return "startup";
  if (ownsInvestor) return "investor";
  const [startupTeam, investorTeam] = await Promise.all([
    isTeamMemberOfEither(userId, deal.startup_id, null),
    isTeamMemberOfEither(userId, null, deal.investor_id),
  ]);
  if (startupTeam) return "startup";
  if (investorTeam) return "investor";
  return null;
}

async function loadDeal(dealId: string) {
  const admin = createAdminClient();
  const { data: deal } = await admin
    .from("deals")
    .select("id, startup_id, investor_id, amount, currency, ownership_percent, valuation_at_close, created_at")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return null;

  const [{ data: startup }, { data: investor }, { data: proposal }, introRes] = await Promise.all([
    admin.from("startups").select("name").eq("id", deal.startup_id).maybeSingle(),
    admin.from("investors").select("display_name, firm_name").eq("id", deal.investor_id).maybeSingle(),
    // The accepted offer carries the terms. The deal row keeps only what is
    // true at close, which is not yet known when this is signed.
    admin.from("deal_proposals")
      .select("amount, currency, equity_pct, valuation, instrument, conditions")
      .match({ startup_id: deal.startup_id, investor_id: deal.investor_id, status: "accepted" })
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // Column names must match 113's introductions table (first_contact_at,
    // tail_ends_at). The dates land in a LEGAL document: a failed lookup has
    // to be loud, because the created_at fallback below is indistinguishable
    // from real data once rendered, and schema drift once rewrote the
    // document's dates silently that way.
    admin.from("introductions")
      .select("first_contact_at, tail_ends_at")
      .match({ startup_id: deal.startup_id, investor_id: deal.investor_id })
      .limit(1).maybeSingle(),
  ]);
  const intro = introRes.data as { first_contact_at?: string; tail_ends_at?: string } | null;
  if (introRes.error) {
    console.error("[deals/seal] introductions lookup failed:", introRes.error);
  }

  const text = dealSealText({
    companyName: startup?.name ?? "the Company",
    investorName: investor?.firm_name || investor?.display_name || "the Investor",
    amount: proposal?.amount ?? deal.amount ?? null,
    currency: proposal?.currency ?? deal.currency ?? null,
    equityPct: proposal?.equity_pct ?? null,
    valuation: proposal?.valuation ?? null,
    instrument: proposal?.instrument ?? null,
    conditions: proposal?.conditions ?? null,
    introducedAt: intro?.first_contact_at ?? deal.created_at,
    // Without an introductions row the date above is the deal's own creation
    // date, and the document must say so rather than assert a recorded
    // introduction it cannot produce.
    introductionOnRecord: !!intro?.first_contact_at,
    tailEndsAt: intro?.tail_ends_at ?? null,
  });

  return { deal, text, companyName: startup?.name ?? null };
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId") ?? "";
  if (!isUuid(dealId)) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const loaded = await loadDeal(dealId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const party = await partyFor(user.id, loaded.deal);
  // Not a party, not their business. The document names both sides and the
  // terms they agreed, so it is not something to hand to a passer-by.
  if (!party) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const state = await sealState(dealId);
  return NextResponse.json({
    dealId,
    party,
    companyName: loaded.companyName,
    text: loaded.text,
    version: DEAL_SEAL_VERSION,
    sha256: sealHash(loaded.text),
    sealed: state.sealed,
    sealedAt: state.sealedAt,
    // The conflict state must REACH the client: both parties signed but over
    // different bytes (a name changed mid-seal). Without this field the UI
    // showed two completed signatures under "waiting on the other side",
    // forever, with no control that could resolve it.
    conflict: state.conflict,
    awaiting: state.awaiting,
    startup: state.startup,
    investor: state.investor,
    mine: party === "startup" ? state.startup : state.investor,
    theirs: party === "startup" ? state.investor : state.startup,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }
  { const rl = await dbRateLimit(user.id, "deal_seal", ...Object.values(RATE.perHour(20)) as [number, number]);
    if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 }); }

  const body = await req.json().catch(() => ({}));
  const dealId = typeof body.dealId === "string" ? body.dealId : "";
  const signedName = typeof body.signedName === "string" ? body.signedName.trim().slice(0, 120) : "";
  const agreed = body.agreed === true;
  // The hash of the bytes the signer actually saw on screen. Optional for
  // backward compatibility, but when present it is checked below so a signer
  // can never be recorded as signing a document other than the one displayed.
  const clientHash = typeof body.agreedSha256 === "string" ? body.agreedSha256 : null;

  if (!isUuid(dealId)) return NextResponse.json({ error: "dealId required" }, { status: 400 });
  if (signedName.length < 2) {
    return NextResponse.json({ error: "signature_name_required", messageKey: "seal.nameRequired" }, { status: 400 });
  }
  if (!agreed) {
    return NextResponse.json({ error: "not_agreed", messageKey: "seal.mustAgree" }, { status: 400 });
  }

  const loaded = await loadDeal(dealId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const party = await partyFor(user.id, loaded.deal);
  if (!party) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A sealed deal is a finished record. Without this, a repeat POST re-ran
  // the completion block below and re-stamped sealed_at, moving the date the
  // fee window and the evidence trail both hang off.
  const existing = await sealState(dealId);
  if (existing.sealed) {
    return NextResponse.json({ signed: false, alreadySealed: true, ...existing });
  }

  const hash = sealHash(loaded.text);
  // Bind the signer to what they saw. If the record changed after the client
  // rendered it (a party edited their name/terms), the client's hash no longer
  // matches -- refuse and make them reload, exactly as /api/nda/accept does,
  // rather than record a signature over bytes they never read.
  if (clientHash && clientHash !== hash) {
    return NextResponse.json(
      { error: "record_changed", messageKey: "seal.recordChanged" },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 400) || null;

  // Upsert on (deal_id, party), not insert. A party re-signing is how an honest
  // mid-seal edit is resolved: if one side signed the old bytes and the record
  // then changed, the other side signs the new bytes (hashes disagree, not
  // sealed), and the first side reloads and re-signs the current record, which
  // updates their row to the current hash and completes the seal. A plain
  // insert made that unrecoverable (23505 "already signed" forever).
  const { error } = await admin.from("deal_seals").upsert({
    deal_id: dealId,
    party,
    signer_user_id: user.id,
    signed_name: signedName,
    seal_version: DEAL_SEAL_VERSION,
    seal_sha256: hash,
    ip_address: ip,
    user_agent: ua,
    signed_at: new Date().toISOString(),
  }, { onConflict: "deal_id,party" });
  if (error) {
    return NextResponse.json({ error: "Could not record the signature" }, { status: 500 });
  }

  let state = await sealState(dealId);

  if (state.startup && state.investor) {
    // Both parties have a signature. It is a completed seal ONLY if both signed
    // the SAME document -- one shared, non-null hash. sealState() computes
    // exactly that (sealed / conflict); mirror its decision into deals so
    // sealed_at and seal_sha256 stay honest and never claim a seal that the
    // signatures do not support.
    const { data: rows } = await admin.from("deal_seals").select("seal_sha256").eq("deal_id", dealId);
    const hashes = new Set((rows ?? []).map((r) => r.seal_sha256).filter(Boolean));
    const agreedHash = hashes.size === 1 ? (Array.from(hashes)[0] as string) : null;

    await admin.from("deals").update({
      // A conflict (hashes disagree) is not a seal: leave sealed_at null so the
      // channel stays closed and the fee is not treated as executed.
      sealed_at: agreedHash ? new Date().toISOString() : null,
      seal_sha256: agreedHash,
      seal_version: DEAL_SEAL_VERSION,
    }).eq("id", dealId);

    // Re-read so the caller is told the sealed_at it will see on reload.
    state = await sealState(dealId);

    if (agreedHash) {
      await admin.from("deal_activity").insert({
        deal_id: dealId,
        startup_id: loaded.deal.startup_id,
        investor_id: loaded.deal.investor_id,
        actor_id: user.id,
        type: "note",
        body: `Deal sealed by both parties. Document ${agreedHash.slice(0, 12)}.`,
      }).then(undefined, () => {});
    }
  }

  // Tell the other side, whichever way round it went: they are either owed a
  // signature or free to talk.
  const [{ data: st }, { data: inv }] = await Promise.all([
    admin.from("startups").select("owner_id, name").eq("id", loaded.deal.startup_id).maybeSingle(),
    admin.from("investors").select("owner_id, display_name, firm_name").eq("id", loaded.deal.investor_id).maybeSingle(),
  ]);
  const otherOwner = party === "startup" ? inv?.owner_id : st?.owner_id;
  const myName = party === "startup"
    ? (st?.name ?? "The company")
    : (inv?.firm_name || inv?.display_name || "The investor");
  if (otherOwner && otherOwner !== user.id) {
    // Complete means SEALED (both signed the same bytes), not merely both
    // present -- a hash conflict signs each party over different documents and
    // is not a completed seal, so the counterpart still owes a matching sig.
    const complete = state.sealed;
    await notifyUser({
      userId: otherOwner,
      type: complete ? "deal_sealed" : "deal_seal_pending",
      title: complete ? `${myName} signed. The deal is sealed.` : `${myName} signed the deal record`,
      titleKey: complete ? "notif.dealSealedTitle" : "notif.dealSealPendingTitle",
      params: { name: myName },
      body: complete ? null : "Your signature is the one still outstanding.",
      bodyKey: complete ? "notif.dealSealedBody" : "notif.dealSealPendingBody",
      href: `/deals?deal=${dealId}`,
    }).catch(() => {});
  }

  return NextResponse.json({ signed: true, ...state });
}
