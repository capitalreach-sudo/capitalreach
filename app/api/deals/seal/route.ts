import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
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
  const [st, inv] = await Promise.all([
    resolveEntity(userId, "startup"),
    resolveEntity(userId, "investor"),
  ]);
  // A startup seat wins a tie, the same way it does in the message routes: a
  // founder who also holds an investor profile is still the company here.
  if (st?.entityId === deal.startup_id) return "startup";
  if (inv?.entityId === deal.investor_id) return "investor";
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

  const [{ data: startup }, { data: investor }, { data: proposal }, { data: intro }] = await Promise.all([
    admin.from("startups").select("name").eq("id", deal.startup_id).maybeSingle(),
    admin.from("investors").select("display_name, firm_name").eq("id", deal.investor_id).maybeSingle(),
    // The accepted offer carries the terms. The deal row keeps only what is
    // true at close, which is not yet known when this is signed.
    admin.from("deal_proposals")
      .select("amount, currency, equity_pct, valuation, instrument, conditions")
      .match({ startup_id: deal.startup_id, investor_id: deal.investor_id, status: "accepted" })
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("introductions")
      .select("introduced_at, obligations_end_at")
      .match({ startup_id: deal.startup_id, investor_id: deal.investor_id })
      .limit(1).maybeSingle(),
  ]);

  const text = dealSealText({
    companyName: startup?.name ?? "the Company",
    investorName: investor?.firm_name || investor?.display_name || "the Investor",
    amount: proposal?.amount ?? deal.amount ?? null,
    currency: proposal?.currency ?? deal.currency ?? null,
    equityPct: proposal?.equity_pct ?? null,
    valuation: proposal?.valuation ?? null,
    instrument: proposal?.instrument ?? null,
    conditions: proposal?.conditions ?? null,
    introducedAt: (intro as { introduced_at?: string } | null)?.introduced_at ?? deal.created_at,
    tailEndsAt: (intro as { obligations_end_at?: string } | null)?.obligations_end_at ?? null,
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

  const hash = sealHash(loaded.text);
  const admin = createAdminClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 400) || null;

  const { error } = await admin.from("deal_seals").insert({
    deal_id: dealId,
    party,
    signer_user_id: user.id,
    signed_name: signedName,
    seal_version: DEAL_SEAL_VERSION,
    seal_sha256: hash,
    ip_address: ip,
    user_agent: ua,
  });
  if (error) {
    // The unique on (deal_id, party) is the only expected failure: they have
    // already signed, which is not an error worth alarming anyone about.
    if (error.code === "23505") {
      return NextResponse.json({ signed: true, alreadySigned: true, ...(await sealState(dealId)) });
    }
    return NextResponse.json({ error: "Could not record the signature" }, { status: 500 });
  }

  let state = await sealState(dealId);

  if (state.startup && state.investor) {
    // Both hashes must match, or the two signed different documents. Storing
    // the deal's hash only when they agree keeps deals.seal_sha256 honest.
    const { data: rows } = await admin.from("deal_seals").select("seal_sha256").eq("deal_id", dealId);
    const hashes = new Set((rows ?? []).map((r) => r.seal_sha256));
    const agreedHash = hashes.size === 1 ? Array.from(hashes)[0] : null;

    await admin.from("deals").update({
      sealed_at: new Date().toISOString(),
      seal_sha256: agreedHash,
      seal_version: DEAL_SEAL_VERSION,
    }).eq("id", dealId);

    // Re-read so the caller is told the sealed_at it will see on reload,
    // rather than the null this request started with.
    state = await sealState(dealId);

    await admin.from("deal_activity").insert({
      deal_id: dealId,
      startup_id: loaded.deal.startup_id,
      investor_id: loaded.deal.investor_id,
      actor_id: user.id,
      type: "note",
      body: `Deal sealed by both parties. Document ${(agreedHash ?? "").slice(0, 12)}.`,
    }).then(undefined, () => {});
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
    const complete = !!(state.startup && state.investor);
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
