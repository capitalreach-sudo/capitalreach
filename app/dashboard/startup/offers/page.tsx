import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import {
  OfferInbox,
  type OfferChain,
  type OfferInvestorIdentity,
  type OfferTerms,
  type TheAsk,
} from "@/components/deals/offer-inbox";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { offerBeforeContactEnabled } from "@/lib/contact-policy";
import { restrictionsFor } from "@/lib/fee-enforcement";
import { DEFAULT_CURRENCY } from "@/lib/currency";

/**
 * Offers, founder side.
 *
 * An investor can no longer open with a message; they open with an amount and
 * terms. This page is where those land, which makes it the screen a founder
 * will check most and the one that decides who gets into their week.
 *
 * A server component so the role bounce happens before anything renders, and
 * so the reads that need the service role can happen at all: migration 109
 * revoked the financial columns of `startups` from the client keys, and the
 * founder's own ask -- the target, the valuation, the equity -- is exactly
 * what every offer on this page has to be read against. Ownership is proved
 * first and the service role is then used with an explicit column list, never
 * a select-star, so a counterparty's private fields cannot ride along. The
 * investor is loaded as their PUBLIC identity only: name, firm, type, trust.
 * Their email is never fetched here, because the introduction is the thing
 * the platform sells and a contact detail on an inbox row gives it away.
 */

/** Hard ceiling on the read. A founder with more open negotiations than this
 *  has a different problem than pagination. */
const MAX_PROPOSALS = 200;

/** A malformed chain must not be able to spin the walk below. */
const MAX_CHAIN_DEPTH = 40;

/** Statuses that end a proposal's life. Anything else is still in play. */
const SETTLED_STATUSES = ["accepted", "declined", "withdrawn"];

interface ProposalRow {
  id: string;
  investor_id: string;
  from_side: string;
  status: string;
  amount: number | null;
  currency: string | null;
  equity_pct: number | null;
  valuation: number | null;
  instrument: string | null;
  conditions: string | null;
  note: string | null;
  counters_id: string | null;
  created_at: string;
}

export default async function StartupOffersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "startup") {
    redirect(profile?.role === "admin" ? "/admin" : "/dashboard/investor");
  }

  const admin = createAdminClient();

  // Owner verified above; the service role sees past the column grants. The
  // list is explicit: this is the founder's own listing, and nothing beyond
  // the ask and the round's state is needed to render offers against it.
  const { data: startup } = await admin
    .from("startups")
    .select("id, name, funding_target, valuation, equity_offered, instrument, min_check_size, round_state, status")
    .eq("owner_id", user.id)
    .order("status", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!startup) redirect("/onboarding/startup");

  const { data: proposalRows } = await admin
    .from("deal_proposals")
    .select("id, investor_id, from_side, status, amount, currency, equity_pct, valuation, instrument, conditions, note, counters_id, created_at")
    .eq("startup_id", startup.id)
    .order("created_at", { ascending: true })
    .limit(MAX_PROPOSALS);

  const proposals: ProposalRow[] = proposalRows ?? [];
  const investorIds = Array.from(new Set(proposals.map((p) => p.investor_id)));

  // Public identity only. `contact_email` and everything else an investor did
  // not publish stays out of this query, not merely out of the markup.
  const [{ data: investorRows }, { data: dealRows }, restrictions, contactGated, t] = await Promise.all([
    investorIds.length
      ? admin
          .from("investors")
          .select("id, slug, display_name, firm_name, type, trust_level, trust_expires_at, logo_url, logo_color")
          .in("id", investorIds)
      : Promise.resolve({ data: [] as Array<{
          id: string; slug: string; display_name: string | null; firm_name: string | null;
          type: string; trust_level: number; trust_expires_at: string | null;
          logo_url: string | null; logo_color: string | null;
        }> }),
    admin.from("deals").select("id, investor_id, status").eq("startup_id", startup.id).limit(500),
    // An unpaid success fee blocks NEW deals. It never hides an offer, a
    // conversation or anything already on the board -- the screen still shows
    // everything, the one thing it withholds is the button that takes more.
    restrictionsFor(startup.id),
    offerBeforeContactEnabled(),
    getTranslator(getLocale()),
  ]);

  const investors = new Map<string, OfferInvestorIdentity>();
  for (const i of investorRows ?? []) {
    // The person first, the firm behind them second. A founder deciding
    // whether to let somebody in is deciding about a counterparty, and a fund
    // name alone hides which partner is actually making the offer.
    const name = i.display_name || i.firm_name || t("offerInbox.unnamed");
    investors.set(i.id, {
      id: i.id,
      slug: i.slug ?? null,
      name,
      firm: i.firm_name && i.firm_name !== name ? i.firm_name : null,
      type: i.type ?? null,
      trustLevel: i.trust_level ?? null,
      trustExpiresAt: i.trust_expires_at ?? null,
      logoUrl: i.logo_url ?? null,
      logoColor: i.logo_color ?? null,
    });
  }

  // The live deal per investor, if the pair already has one. "passed" and
  // "closed" are history, so they do not claim a conversation is open.
  const liveDeal = new Map<string, string>();
  for (const d of dealRows ?? []) {
    if (d.status === "passed" || d.status === "closed") continue;
    if (!liveDeal.has(d.investor_id)) liveDeal.set(d.investor_id, d.id);
  }

  // ── Chains ────────────────────────────────────────────────────────────────
  // A counter is a new proposal pointing at the one it answers, so a
  // negotiation is a linked list. Walk each proposal back to its root, group
  // by root, and the newest link is the terms currently on the table.
  const byId = new Map<string, ProposalRow>(proposals.map((p) => [p.id, p]));

  function rootOf(p: ProposalRow): ProposalRow {
    let cur = p;
    const seen = new Set<string>([cur.id]);
    for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
      const parentId = cur.counters_id;
      if (!parentId) break;
      const parent = byId.get(parentId);
      // A parent outside this page's window (or already visited) ends the
      // walk: a truncated chain is still a readable one.
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      cur = parent;
    }
    return cur;
  }

  const grouped = new Map<string, ProposalRow[]>();
  for (const p of proposals) {
    const root = rootOf(p);
    // Founder-originated approaches belong to the deal board, not to an inbox
    // of offers received. A chain counts as incoming when the INVESTOR opened
    // it, however many times the founder has answered since.
    if (root.from_side !== "investor") continue;
    const list = grouped.get(root.id);
    if (list) list.push(p); else grouped.set(root.id, [p]);
  }

  const chains: OfferChain[] = [];
  for (const [rootId, list] of Array.from(grouped.entries())) {
    const investor = investors.get(list[0].investor_id);
    if (!investor) continue; // an investor row that no longer exists renders nothing
    const trail = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    // The terms on the table are the newest link that is still in play. A
    // chain can branch -- an offer withdrawn after a counter went out -- and
    // reading the settled branch as the head would tell a founder a live
    // offer had ended.
    const live = trail.filter((p) => !SETTLED_STATUSES.includes(p.status));
    const head = live.length ? live[live.length - 1] : trail[trail.length - 1];
    chains.push({
      key: rootId,
      investor,
      head: toTerms(head),
      trail: trail.map(toTerms),
      dealId: liveDeal.get(investor.id) ?? null,
    });
  }
  // Newest negotiation first: the offer that arrived this morning is the one
  // the founder came here for.
  chains.sort((a, b) => b.head.createdAt.localeCompare(a.head.createdAt));

  const ask: TheAsk = {
    fundingTarget: startup.funding_target ?? null,
    valuation: startup.valuation ?? null,
    equityOffered: startup.equity_offered ?? null,
    instrument: startup.instrument ?? null,
    minCheck: startup.min_check_size ?? null,
    // Listing figures carry no currency of their own, so they are all read in
    // the platform's default and offers in another currency are never
    // silently converted against them.
    currency: DEFAULT_CURRENCY,
  };

  // The figure beside the title has to agree with the section below it: an
  // offer is waiting on the founder when the newest terms came from the
  // investor and nobody has answered them yet.
  const waiting = chains.filter(
    (c) => c.head.fromSide === "investor" && !SETTLED_STATUSES.includes(c.head.status),
  ).length;

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "100vh", paddingBottom: "64px" }}>
        <div style={{ maxWidth: "672px", margin: "0 auto", padding: "40px 24px" }}>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
            <Link
              href="/dashboard/startup"
              style={{
                display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "40px",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
                color: "var(--cr-ink-4)", textDecoration: "none",
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} aria-hidden /> {t("common.back")}
            </Link>
            <div style={{ width: 1, height: 14, background: "var(--cr-rule-dark)" }} aria-hidden />
            <h1 style={{
              fontFamily: "var(--font-serif)", fontWeight: 700, fontStyle: "italic",
              fontSize: "clamp(22px, 4vw, 28px)", color: "var(--cr-ink)", letterSpacing: "-0.02em",
            }}>
              {t("offerInbox.title")}
            </h1>
            {waiting > 0 && (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
                fontWeight: 700, fontSize: "13px", color: "var(--cr-copper)",
              }}>
                {String(waiting).padStart(2, "0")}
              </span>
            )}
          </div>

          <p style={{
            fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
            fontWeight: 500, fontSize: "11px", letterSpacing: "0.02em",
            color: "var(--cr-ink-4)", marginBottom: "16px",
          }}>
            {startup.name}
          </p>

          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
            lineHeight: 1.65, color: "var(--cr-ink-3)", maxWidth: "62ch",
            marginBottom: contactGated ? "8px" : "32px",
          }}>
            {t("offerInbox.lead")}
          </p>
          {contactGated && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px",
              lineHeight: 1.65, color: "var(--cr-ink-4)", maxWidth: "62ch", marginBottom: "32px",
            }}>
              {t("offerInbox.leadGated")}
            </p>
          )}

          <OfferInbox
            chains={chains}
            ask={ask}
            startupId={startup.id}
            restricted={restrictions.accountRestricted}
            contactGated={contactGated}
          />
        </div>
      </main>
    </>
  );
}

function toTerms(p: ProposalRow): OfferTerms {
  return {
    id: p.id,
    fromSide: p.from_side,
    status: p.status,
    amount: p.amount ?? null,
    currency: p.currency ?? null,
    equityPct: p.equity_pct ?? null,
    valuation: p.valuation ?? null,
    instrument: p.instrument ?? null,
    conditions: p.conditions ?? null,
    note: p.note ?? null,
    createdAt: p.created_at,
  };
}
