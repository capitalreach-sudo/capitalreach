"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntityLogo } from "@/components/shared/entity-logo";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocale } from "@/components/providers/locale-provider";
import { CURRENCIES, formatMoney, isCurrencyCode, type CurrencyCode } from "@/lib/currency";
import { TRUST_LADDER, effectiveTrustLevel } from "@/lib/trust";

/**
 * The founder's offer inbox.
 *
 * An investor can no longer open with "love what you're building, quick
 * call?". They open with a number and terms, and this is where those land --
 * which makes it the most consequential screen a founder has. It is built as a
 * ledger, not a feed: every offer states who, how much, on what terms, how
 * that differs from what the company asked for, and when it arrived.
 *
 * Three answers, and their weights are deliberately unequal.
 *
 *   ACCEPT is the moment a conversation opens. That is said beside the button
 *   rather than discovered afterwards, and it takes a second click, because a
 *   misclick that puts a stranger in your inbox is not a small thing.
 *
 *   COUNTER is an edit of THEIR terms, prefilled with what they wrote. A
 *   founder countering should be changing the two numbers they disagree with,
 *   not retyping a term sheet.
 *
 *   DECLINE asks for nothing. No reason field, no "help them improve", no
 *   dropdown of polite excuses. A founder passing on money owes the other side
 *   an answer, and nothing else. It confirms once and only to catch a stray
 *   tap -- the confirm asks whether, never why.
 *
 * The investor's trust level rides on the row itself. Anywhere else on the
 * platform it is context; here it is the decision, because this is the moment
 * a founder is being asked to let somebody in.
 *
 * Nothing on this screen removes anything. Declining an offer ends that offer,
 * the investor may make another, and the record of both stays readable.
 */

// ── House register (docs/DESIGN-SPEC.md) ────────────────────────────────────

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const DATA: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
  fontWeight: 500, fontSize: "12px", letterSpacing: "0.02em", color: "var(--cr-ink-2)",
};

const BODY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  lineHeight: 1.65, color: "var(--cr-ink-3)",
};

const TITLE: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px",
  color: "var(--cr-ink)", margin: 0,
};

const RULE: CSSProperties = { borderTop: "1px solid var(--cr-rule)" };

const CARD: CSSProperties = {
  background: "var(--cr-paper)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
  boxShadow: "var(--cr-card-shadow)",
};

const BADGE: CSSProperties = {
  ...LABEL, fontSize: "9px", borderRadius: "3px", padding: "3px 6px",
  border: "1px solid var(--cr-rule-dark)", whiteSpace: "nowrap", flexShrink: 0,
};

const FIELD: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
  fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)",
  background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px", padding: "10px 12px", width: "100%", minWidth: 0,
};

const PRIMARY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
  color: "var(--cr-band-ink)", background: "var(--cr-copper)",
  border: "none", borderRadius: "999px", padding: "0 20px",
  minHeight: "40px", cursor: "pointer",
};

const SECONDARY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
  color: "var(--cr-ink)", background: "transparent",
  border: "1px solid var(--cr-paper-4)", borderRadius: "999px", padding: "0 20px",
  minHeight: "40px", cursor: "pointer",
};

const QUIET: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
  color: "var(--cr-ink-4)", background: "none", border: "none",
  minHeight: "40px", padding: "0 8px", cursor: "pointer", textDecoration: "underline",
};

/** Card internals stay on the scale at both ends: 16 on a 375px screen, 24 on
 *  a desktop column. Inline styles cannot carry a media query. */
const PAD = "clamp(16px, 4vw, 24px)";

// ── The shape the page hands over ───────────────────────────────────────────

/** The investor as the founder is allowed to see them. No email, ever: the
 *  platform sells the introduction, and the introduction is the conversation
 *  an accepted offer opens -- not a contact detail lifted off an inbox row. */
export interface OfferInvestorIdentity {
  id: string;
  slug: string | null;
  name: string;
  firm: string | null;
  type: string | null;
  trustLevel: number | null;
  trustExpiresAt: string | null;
  logoUrl: string | null;
  logoColor: string | null;
}

export interface OfferTerms {
  id: string;
  /** "investor" or "startup" -- who put these terms on the table. */
  fromSide: string;
  /** pending | countered | accepted | declined | withdrawn */
  status: string;
  amount: number | null;
  currency: string | null;
  equityPct: number | null;
  valuation: number | null;
  instrument: string | null;
  conditions: string | null;
  note: string | null;
  createdAt: string;
}

export interface OfferChain {
  /** The root proposal's id: one negotiation, however many counters deep. */
  key: string;
  investor: OfferInvestorIdentity;
  /** The live terms -- the newest link in the chain. */
  head: OfferTerms;
  /** The whole negotiation, oldest first, head last. */
  trail: OfferTerms[];
  /** An existing deal with this investor, if the pair is already on the board. */
  dealId: string | null;
}

/** What the company asked for, which is what every offer is read against. */
export interface TheAsk {
  fundingTarget: number | null;
  valuation: number | null;
  equityOffered: number | null;
  instrument: string | null;
  minCheck: number | null;
  /** Listing figures carry no currency column, so they are all in this one. */
  currency: CurrencyCode;
}

const INSTRUMENTS = ["equity", "safe", "convertible_note"] as const;

function humanise(slug: string): string {
  return slug.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Where the offer is in its life, from the founder's point of view. */
type Standing = "yours" | "theirs" | "accepted" | "closed";

function standingOf(chain: OfferChain): Standing {
  const s = chain.head.status;
  if (s === "accepted") return "accepted";
  if (s === "declined" || s === "withdrawn") return "closed";
  // "countered" heads a chain only until the counter row exists; either way an
  // open head from their side is the founder's move and nobody else's.
  return chain.head.fromSide === "investor" ? "yours" : "theirs";
}

// ── The screen ──────────────────────────────────────────────────────────────

export function OfferInbox({
  chains,
  ask,
  startupId,
  restricted = false,
  contactGated = false,
}: {
  chains: OfferChain[];
  ask: TheAsk;
  /** The founder's own listing, for the thread an accepted offer opened. */
  startupId: string;
  /** An unpaid success fee is blocking new deals. Never hides anything. */
  restricted?: boolean;
  /** offer_before_contact is on, so silence until acceptance is a real rule. */
  contactGated?: boolean;
}) {
  const { t } = useTranslation();

  const groups = useMemo(() => {
    const yours: OfferChain[] = [], theirs: OfferChain[] = [], settled: OfferChain[] = [];
    for (const c of chains) {
      const s = standingOf(c);
      if (s === "yours") yours.push(c);
      else if (s === "theirs") theirs.push(c);
      else settled.push(c);
    }
    return { yours, theirs, settled };
  }, [chains]);

  return (
    <div>
      {/* A restriction is stated once, at the top, in the founder's own terms:
          what they cannot do, what is untouched, and the one link that ends
          it. No red, no alarm -- an unpaid invoice is a fact, not an alarm. */}
      {restricted && (
        <div style={{
          borderTop: "1px solid var(--cr-copper-br)",
          borderBottom: "1px solid var(--cr-copper-br)",
          background: "var(--cr-copper-bg)",
          padding: "16px", marginBottom: "32px",
        }}>
          <p style={{ ...BODY, color: "var(--cr-ink-2)", maxWidth: "64ch" }}>
            {t("offerInbox.restricted")}
          </p>
          <Link
            href="/dashboard/startup/billing"
            style={{ ...BODY, fontWeight: 500, color: "var(--cr-copper)", textDecoration: "none" }}
          >
            {t("offerInbox.restrictedAction")} →
          </Link>
        </div>
      )}

      <AskStrip ask={ask} />

      {chains.length === 0 ? (
        <Empty />
      ) : (
        <>
          <Section title={t("offerInbox.waitingOnYou")} count={groups.yours.length}>
            {groups.yours.length === 0 ? (
              <p style={{ ...BODY, ...RULE, paddingTop: "12px", color: "var(--cr-ink-4)" }}>
                {t("offerInbox.noneWaiting")}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {groups.yours.map((c, i) => (
                  <OfferCard key={c.key} chain={c} ask={ask} index={i + 1} startupId={startupId}
                    restricted={restricted} contactGated={contactGated} actionable />
                ))}
              </div>
            )}
          </Section>

          {groups.theirs.length > 0 && (
            <Section title={t("offerInbox.waitingOnThem")} count={groups.theirs.length}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {groups.theirs.map((c, i) => (
                  <OfferCard key={c.key} chain={c} ask={ask} index={i + 1} startupId={startupId}
                    restricted={restricted} contactGated={contactGated} actionable={false} />
                ))}
              </div>
            </Section>
          )}

          {groups.settled.length > 0 && (
            <Section title={t("offerInbox.settled")} count={groups.settled.length}>
              <div>
                {groups.settled.map((c) => <SettledRow key={c.key} chain={c} startupId={startupId} />)}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

/** Every section on every surface opens with a ruled label, never a naked h2. */
function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "48px" }}>
      <div className="ruled-label" style={{ marginBottom: "12px" }}>
        <span>{title}</span>
        <span style={{ ...DATA, fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)" }}>
          {String(count).padStart(2, "0")}
        </span>
      </div>
      {children}
    </section>
  );
}

/** The baseline. Only figures that exist are rendered: an absent valuation is
 *  absent, not a dash in a row of its own. */
function AskStrip({ ask }: { ask: TheAsk }) {
  const { t } = useTranslation();
  const cells: Array<{ label: string; value: string }> = [];

  if (ask.fundingTarget && ask.fundingTarget > 0) {
    cells.push({ label: t("offerInbox.askAmount"), value: formatMoney(ask.fundingTarget, ask.currency, { compact: true }) });
  }
  if (ask.valuation && ask.valuation > 0) {
    cells.push({ label: t("offerInbox.askValuation"), value: formatMoney(ask.valuation, ask.currency, { compact: true }) });
  }
  if (ask.equityOffered && ask.equityOffered > 0) {
    cells.push({ label: t("offerInbox.askEquity"), value: `${ask.equityOffered}%` });
  }
  if (ask.instrument) {
    cells.push({ label: t("offerInbox.askInstrument"), value: instrumentLabel(ask.instrument, t) });
  }
  if (ask.minCheck && ask.minCheck > 0) {
    cells.push({ label: t("offerInbox.askMinCheck"), value: formatMoney(ask.minCheck, ask.currency, { compact: true }) });
  }
  if (cells.length === 0) return null;

  return (
    <div style={{ marginBottom: "48px" }}>
      <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("offerInbox.askTitle")}</div>
      <div style={{
        ...RULE, borderBottom: "1px solid var(--cr-rule)",
        display: "flex", flexWrap: "wrap", gap: "24px", padding: "12px 0",
      }}>
        {cells.map((c) => (
          <div key={c.label} style={{ minWidth: 0 }}>
            <div style={{ ...LABEL, marginBottom: "4px" }}>{c.label}</div>
            <div style={{ ...DATA, fontSize: "14px", fontWeight: 600, color: "var(--cr-ink)" }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  const { t } = useTranslation();
  return (
    <div style={{ ...CARD, padding: "48px 24px", textAlign: "center" }}>
      <span aria-hidden style={{ display: "block", color: "var(--cr-copper)", fontSize: "14px", lineHeight: 1, marginBottom: "12px" }}>✦</span>
      <p style={{ ...TITLE, marginBottom: "8px" }}>{t("offerInbox.empty")}</p>
      <p style={{ ...BODY, maxWidth: "48ch", margin: "0 auto 16px" }}>{t("offerInbox.emptyBody")}</p>
      <Link
        href="/dashboard/startup/edit"
        style={{ ...BODY, fontSize: "13px", fontWeight: 500, color: "var(--cr-copper)", textDecoration: "none" }}
      >
        {t("offerInbox.emptyAction")} →
      </Link>
    </div>
  );
}

// ── One offer ───────────────────────────────────────────────────────────────

/** Label left, value right, split by a hairline, with room for the one line
 *  that says how the value differs from the ask. */
function Fact({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div style={{ ...RULE, padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px" }}>
        <span style={{ ...LABEL, flexShrink: 0 }}>{label}</span>
        <span style={{ textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{value}</span>
      </div>
      {note && (
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "4px", textAlign: "right" }}>
          {note}
        </p>
      )}
    </div>
  );
}

function OfferCard({ chain, ask, index, startupId, restricted, contactGated, actionable }: {
  chain: OfferChain;
  ask: TheAsk;
  index: number;
  startupId: string;
  restricted: boolean;
  contactGated: boolean;
  actionable: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "accept" | "decline" | "counter">("idle");
  const [showTrail, setShowTrail] = useState(false);

  const o = chain.head;
  const inv = chain.investor;
  const level = effectiveTrustLevel(inv.trustLevel, inv.trustExpiresAt);

  const stamp = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(locale, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  const num = (v: number, opts: Intl.NumberFormatOptions = {}): string => {
    try { return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, ...opts }).format(v); }
    catch { return String(v); }
  };

  // Money is only comparable inside one currency, and the platform does not
  // convert. An offer in another currency still renders in full; it simply
  // does not claim a percentage against a figure in a different unit.
  const comparable = !o.currency || o.currency === ask.currency;

  // Built as text rather than inline, so a comparison that cannot be made
  // leaves no empty line behind under the figure.
  const amountNotes: string[] = [];
  if (comparable && o.amount != null && o.amount > 0) {
    if (ask.fundingTarget && ask.fundingTarget > 0) {
      amountNotes.push(t("offerInbox.shareOfRound", {
        pct: num((o.amount / ask.fundingTarget) * 100),
        target: formatMoney(ask.fundingTarget, ask.currency, { compact: true }),
      }));
    }
    if (ask.minCheck && ask.minCheck > 0 && o.amount < ask.minCheck) {
      amountNotes.push(t("offerInbox.belowMinCheck", {
        min: formatMoney(ask.minCheck, ask.currency, { compact: true }),
      }));
    }
  }

  async function answer(action: "accept" | "decline") {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/deals/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, action }),
    }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    setMode("idle");
    if (!res || !res.ok) {
      notify.error(j?.error || t("errors.generic"));
      return;
    }
    notify.success(action === "accept" ? t("offerInbox.accepted") : t("offerInbox.declined"));
    // The page is a server component holding the record; re-read it rather
    // than patching a copy of the truth in the browser.
    router.refresh();
  }

  return (
    <article style={{ ...CARD, padding: PAD }}>

      {/* Who, how much, and -- at the one moment it decides something -- what
          has actually been checked about them. */}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", minWidth: 0 }}>
          <span aria-hidden style={{ ...DATA, fontWeight: 600, color: "var(--cr-copper)", flexShrink: 0, lineHeight: "40px" }}>
            {String(index).padStart(2, "0")}
          </span>
          <EntityLogo name={inv.name} logoUrl={inv.logoUrl} logoColor={inv.logoColor} size={40} radius={4} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <p style={{ ...TITLE, overflowWrap: "anywhere" }}>
                {inv.slug ? (
                  <Link href={`/investors/${inv.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{inv.name}</Link>
                ) : inv.name}
              </p>
              <VerifiedBadge
                kind="investor"
                trustLevel={inv.trustLevel}
                trustExpiresAt={inv.trustExpiresAt}
              />
            </div>
            {(inv.firm || inv.type) && (
              <p style={{ ...BODY, fontSize: "12px", marginTop: "2px" }}>
                {[inv.firm, inv.type ? humanise(inv.type) : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 0 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
            fontWeight: 700, fontSize: "15px", letterSpacing: "0.01em", color: "var(--cr-copper)",
          }}>
            {o.amount != null && o.amount > 0 ? formatMoney(o.amount, o.currency) : t("offerInbox.amountMissing")}
          </div>
          <div style={{ ...LABEL, marginTop: "4px" }}>{stamp(o.createdAt)}</div>
        </div>
      </header>

      {/* The terms, and beside each the one line that says how it differs from
          what the company asked for. That comparison is the work a founder
          would otherwise do on paper for every offer that lands. */}
      <div style={{ marginTop: "16px" }}>
        <div style={{ ...LABEL, marginBottom: "4px" }}>{t("offerInbox.termsTitle")}</div>

        {o.amount != null && o.amount > 0 && (
          <Fact
            label={t("offerInbox.amount")}
            value={<span style={{ ...DATA, fontSize: "13px", color: "var(--cr-ink)" }}>{formatMoney(o.amount, o.currency)}</span>}
            note={amountNotes.length ? amountNotes.join(" · ") : null}
          />
        )}

        {o.valuation != null && o.valuation > 0 && (
          <Fact
            label={t("offerInbox.valuation")}
            value={<span style={{ ...DATA, fontSize: "13px", color: "var(--cr-ink)" }}>{formatMoney(o.valuation, o.currency)}</span>}
            note={
              comparable && ask.valuation && ask.valuation > 0 ? (
                <>
                  {/* The only green/red on this screen. A valuation above or
                      below the one that was asked for is money moving in a
                      direction, which is the single thing the up/down tokens
                      are allowed to mean. */}
                  <span style={{
                    ...DATA, fontSize: "11px",
                    color: o.valuation === ask.valuation ? "var(--cr-ink-4)"
                      : o.valuation > ask.valuation ? "var(--cr-up)" : "var(--cr-down)",
                  }}>
                    {num(((o.valuation - ask.valuation) / ask.valuation) * 100, { signDisplay: "exceptZero" })}%
                  </span>
                  {" "}
                  {t("offerInbox.againstAsk", { ask: formatMoney(ask.valuation, ask.currency, { compact: true }) })}
                </>
              ) : null
            }
          />
        )}

        {o.equityPct != null && o.equityPct > 0 && (
          <Fact
            label={t("offerInbox.equity")}
            value={<span style={{ ...DATA, fontSize: "13px", color: "var(--cr-ink)" }}>{num(o.equityPct)}%</span>}
            // Not a delta: their percentage is for their cheque, the listing's
            // is for the whole round. Two different quantities, so the row
            // states the other one rather than subtracting them.
            note={ask.equityOffered && ask.equityOffered > 0
              ? t("offerInbox.equityAsk", { pct: num(ask.equityOffered) })
              : null}
          />
        )}

        {o.instrument && (
          <Fact
            label={t("offerInbox.instrument")}
            value={<span style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink)" }}>{instrumentLabel(o.instrument, t)}</span>}
            note={ask.instrument && ask.instrument !== o.instrument
              ? t("offerInbox.instrumentAsk", { instrument: instrumentLabel(ask.instrument, t) })
              : null}
          />
        )}

        <Fact
          label={t("offerInbox.verification")}
          value={
            <span style={{ ...BODY, fontSize: "13px", color: level > 0 ? "var(--verdigris)" : "var(--cr-ink-4)" }}>
              {level > 0 ? t(TRUST_LADDER[level].key) : t("offerInbox.noVerification")}
            </span>
          }
          note={level > 0 ? t(TRUST_LADDER[level].meansKey) : t("offerInbox.noVerificationNote")}
        />

        {o.conditions && (
          <div style={{ ...RULE, padding: "8px 0" }}>
            <div style={{ ...LABEL, marginBottom: "4px" }}>{t("offerInbox.conditions")}</div>
            <p style={{ ...BODY, color: "var(--cr-ink-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {o.conditions}
            </p>
          </div>
        )}

        {o.note && (
          <div style={{ ...RULE, padding: "8px 0" }}>
            <div style={{ ...LABEL, marginBottom: "4px" }}>
              {o.fromSide === "investor" ? t("offerInbox.theirNote") : t("offerInbox.yourNote")}
            </div>
            <p style={{ ...BODY, color: "var(--cr-ink-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {o.note}
            </p>
          </div>
        )}
      </div>

      {/* The negotiation so far, folded away until it is asked for: two rows
          of history must not outweigh the offer on the table. */}
      {chain.trail.length > 1 && (
        <div style={{ marginTop: "12px" }}>
          <button
            type="button"
            onClick={() => setShowTrail((v) => !v)}
            style={{ ...QUIET, padding: 0, textAlign: "left" }}
            aria-expanded={showTrail}
          >
            {showTrail ? t("offerInbox.chainHide") : t("offerInbox.chainShow", { count: chain.trail.length })}
          </button>
          {showTrail && (
            <div style={{ marginTop: "8px" }}>
              {chain.trail.map((step) => (
                <div key={step.id} style={{
                  ...RULE, display: "flex", alignItems: "baseline",
                  justifyContent: "space-between", gap: "12px", padding: "8px 0",
                }}>
                  <span style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-2)", minWidth: 0 }}>
                    {step.fromSide === "investor" ? t("offerInbox.sideThem") : t("offerInbox.sideYou")}
                    {" · "}
                    {step.amount != null && step.amount > 0
                      ? formatMoney(step.amount, step.currency, { compact: true })
                      : t("offerInbox.amountMissing")}
                  </span>
                  <span style={{ ...DATA, fontSize: "11px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                    {stamp(step.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The answers. */}
      <div style={{ ...RULE, marginTop: "16px", paddingTop: "16px" }}>
        {chain.dealId && (
          <p style={{ ...BODY, fontSize: "12px", marginBottom: "8px" }}>
            <span style={{ color: "var(--verdigris)" }}>{t("offerInbox.dealExists")}</span>
            {" "}
            <Link
              href={`/dashboard/messages?startupId=${encodeURIComponent(startupId)}&investorId=${encodeURIComponent(chain.investor.id)}`}
              style={{ color: "var(--cr-copper)", fontWeight: 500, textDecoration: "none" }}
            >
              {t("offerInbox.openConversation")} →
            </Link>
          </p>
        )}

        {!actionable ? (
          <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)" }}>
            {t("offerInbox.yourCounterOut")}
          </p>
        ) : mode === "counter" ? (
          <CounterComposer
            head={o}
            ask={ask}
            investorName={inv.name}
            onDone={() => { setMode("idle"); router.refresh(); }}
            onCancel={() => setMode("idle")}
          />
        ) : mode === "accept" ? (
          <div>
            <p style={{ ...BODY, color: "var(--cr-ink-2)", maxWidth: "56ch", marginBottom: "12px" }}>
              {t("offerInbox.acceptExplain", { name: inv.name })}
            </p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => answer("accept")} disabled={busy}
                style={{ ...PRIMARY, opacity: busy ? 0.45 : 1 }}>
                {busy ? t("offerInbox.working") : t("offerInbox.acceptConfirm")}
              </button>
              <button type="button" onClick={() => setMode("idle")} disabled={busy} style={QUIET}>
                {t("offerInbox.notYet")}
              </button>
            </div>
          </div>
        ) : mode === "decline" ? (
          <div>
            {/* Whether, never why. There is no reason field on this screen and
                there will not be one: a founder passing owes an answer and
                nothing else. */}
            <p style={{ ...BODY, color: "var(--cr-ink-2)", maxWidth: "56ch", marginBottom: "12px" }}>
              {t("offerInbox.declineAsk")}
            </p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => answer("decline")} disabled={busy}
                style={{ ...SECONDARY, opacity: busy ? 0.45 : 1 }}>
                {busy ? t("offerInbox.working") : t("offerInbox.declineConfirm")}
              </button>
              <button type="button" onClick={() => setMode("idle")} disabled={busy} style={QUIET}>
                {t("offerInbox.keepIt")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setMode("accept")}
                disabled={restricted}
                style={{ ...PRIMARY, opacity: restricted ? 0.45 : 1, cursor: restricted ? "default" : "pointer" }}
              >
                {t("offerInbox.accept")}
              </button>
              <button type="button" onClick={() => setMode("counter")} style={SECONDARY}>
                {t("offerInbox.counter")}
              </button>
              <button type="button" onClick={() => setMode("decline")} style={QUIET}>
                {t("offerInbox.decline")}
              </button>
            </div>
            {/* Said beside the button, not discovered after it. A restricted
                account is told why the one button is dark, in the same place
                the sentence about accepting would have been. */}
            <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "12px", maxWidth: "60ch" }}>
              {restricted
                ? t("offerInbox.restricted")
                : `${t("offerInbox.acceptOpens", { name: inv.name })}${contactGated ? ` ${t("offerInbox.acceptOpensGated")}` : ""}`}
            </p>
          </>
        )}
      </div>
    </article>
  );
}

// ── Countering ──────────────────────────────────────────────────────────────

/**
 * The founder's side of the composer the investor writes their opening offer
 * in. The markup is duplicated rather than shared on purpose: this is the
 * founder's screen, the two forms answer to different defaults (theirs opens
 * from the listing, this one opens from the terms being answered), and a
 * shared component would have made every later change to one of them a change
 * to both.
 *
 * Every field starts at what THEY wrote. A counter is an edit of their terms,
 * so the founder changes the number they disagree with and leaves the rest
 * standing.
 */
function CounterComposer({ head, ask, investorName, onDone, onCancel }: {
  head: OfferTerms;
  ask: TheAsk;
  investorName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [amount, setAmount] = useState(head.amount != null && head.amount > 0 ? String(Math.round(head.amount)) : "");
  const [currency, setCurrency] = useState<CurrencyCode>(
    isCurrencyCode(head.currency) ? head.currency : ask.currency,
  );
  const [valuation, setValuation] = useState(
    head.valuation != null && head.valuation > 0 ? String(Math.round(head.valuation))
      : ask.valuation && ask.valuation > 0 ? String(Math.round(ask.valuation)) : "",
  );
  const [equity, setEquity] = useState(head.equityPct != null && head.equityPct > 0 ? String(head.equityPct) : "");
  const [instrument, setInstrument] = useState(head.instrument ?? ask.instrument ?? "");
  const [conditions, setConditions] = useState(head.conditions ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const amountNumber = parseInt(amount || "0", 10);
  const canSend = !busy && Number.isFinite(amountNumber) && amountNumber > 0;

  // An instrument the platform has no phrase for still has to survive a
  // counter: it is kept as an option rather than silently reset to blank.
  const instrumentOptions: string[] =
    !head.instrument || (INSTRUMENTS as readonly string[]).includes(head.instrument)
      ? [...INSTRUMENTS]
      : [...INSTRUMENTS, head.instrument];

  async function send() {
    if (!canSend) return;
    setBusy(true);
    const res = await fetch("/api/deals/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // The route derives startup, investor and side from the proposal being
        // answered and from the caller. Identity is never sent from a browser.
        countersId: head.id,
        amount: amountNumber,
        currency,
        valuation: valuation ? parseInt(valuation, 10) : null,
        equityPct: equity ? Number(equity) : null,
        instrument: instrument || null,
        conditions: conditions.trim() || null,
        note: note.trim() || null,
      }),
    }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res || !res.ok) {
      notify.error(j?.error || t("errors.generic"));
      return;
    }
    notify.success(t("offerInbox.counterSent", { name: investorName }));
    onDone();
  }

  const preview = Number.isFinite(amountNumber) && amountNumber > 0 ? formatMoney(amountNumber, currency) : "";

  return (
    <div>
      <div style={{ ...LABEL, marginBottom: "4px" }}>{t("offerInbox.counterTitle")}</div>
      <p style={{ ...BODY, maxWidth: "60ch", marginBottom: "16px" }}>{t("offerInbox.counterLead")}</p>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "12px" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <label htmlFor={`counter-amount-${head.id}`} style={{ ...LABEL, display: "block", marginBottom: "4px" }}>
            {t("offerInbox.amountLabel")}
          </label>
          <input
            id={`counter-amount-${head.id}`}
            type="text"
            inputMode="numeric"
            value={amount}
            // Digits only: the column is a whole-unit number, and a separator
            // typed here must not become a different figure.
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="0"
            style={FIELD}
          />
        </div>
        <div style={{ flex: "0 1 140px", minWidth: 0 }}>
          <label htmlFor={`counter-currency-${head.id}`} style={{ ...LABEL, display: "block", marginBottom: "4px" }}>
            {t("offerInbox.currencyLabel")}
          </label>
          <select
            id={`counter-currency-${head.id}`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            style={{ ...FIELD, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", cursor: "pointer" }}
          >
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
      </div>
      <p style={{ ...DATA, color: "var(--cr-ink-4)", marginBottom: "16px", minHeight: "18px" }}>{preview}</p>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "16px" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <label htmlFor={`counter-valuation-${head.id}`} style={{ ...LABEL, display: "block", marginBottom: "4px" }}>
            {t("offerInbox.valuationLabel")}
          </label>
          <input
            id={`counter-valuation-${head.id}`}
            type="text"
            inputMode="numeric"
            value={valuation}
            onChange={(e) => setValuation(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder="0"
            style={FIELD}
          />
        </div>
        <div style={{ flex: "0 1 140px", minWidth: 0 }}>
          <label htmlFor={`counter-equity-${head.id}`} style={{ ...LABEL, display: "block", marginBottom: "4px" }}>
            {t("offerInbox.equityLabel")}
          </label>
          <input
            id={`counter-equity-${head.id}`}
            type="text"
            inputMode="decimal"
            value={equity}
            // One decimal point, digits either side, nothing else.
            onChange={(e) => setEquity(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 5))}
            placeholder="0"
            style={FIELD}
          />
        </div>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <label htmlFor={`counter-instrument-${head.id}`} style={{ ...LABEL, display: "block", marginBottom: "4px" }}>
            {t("offerInbox.instrumentLabel")}
          </label>
          <select
            id={`counter-instrument-${head.id}`}
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            style={{ ...FIELD, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", cursor: "pointer" }}
          >
            <option value="">{t("offerInbox.instrumentUnset")}</option>
            {instrumentOptions.map((i) => (
              <option key={i} value={i}>{instrumentLabel(i, t)}</option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor={`counter-conditions-${head.id}`} style={{ ...LABEL, display: "block", marginBottom: "4px" }}>
        {t("offerInbox.conditionsLabel")}
      </label>
      <textarea
        id={`counter-conditions-${head.id}`}
        value={conditions}
        onChange={(e) => setConditions(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder={t("offerInbox.conditionsPlaceholder")}
        style={{ ...FIELD, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: 400, lineHeight: 1.6, resize: "vertical", marginBottom: "16px" }}
      />

      <label htmlFor={`counter-note-${head.id}`} style={{ ...LABEL, display: "block", marginBottom: "4px" }}>
        {t("offerInbox.noteLabel")}
      </label>
      <textarea
        id={`counter-note-${head.id}`}
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder={t("offerInbox.notePlaceholder")}
        style={{ ...FIELD, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: 400, lineHeight: 1.6, resize: "vertical", marginBottom: "16px" }}
      />

      <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", maxWidth: "60ch", marginBottom: "16px" }}>
        {t("offerInbox.counterNote", { name: investorName })}
      </p>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={send} disabled={!canSend}
          style={{ ...PRIMARY, opacity: canSend ? 1 : 0.45, cursor: canSend ? "pointer" : "default" }}>
          {busy ? t("offerInbox.working") : t("offerInbox.counterSend")}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} style={QUIET}>
          {t("offerInbox.cancel")}
        </button>
        <span style={{ ...DATA, fontSize: "11px", color: "var(--cr-ink-4)" }}>
          {new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date())}
        </span>
      </div>
    </div>
  );
}

// ── Settled ─────────────────────────────────────────────────────────────────

/** Answered offers stay readable and stay quiet: rules, no cards, no colour.
 *  An accepted one keeps the single link that matters -- the conversation it
 *  opened. */
function SettledRow({ chain, startupId }: { chain: OfferChain; startupId: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const o = chain.head;
  const day = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  };

  const accepted = o.status === "accepted";

  return (
    <div style={{ ...RULE, display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", flexWrap: "wrap" }}>
      <EntityLogo name={chain.investor.name} logoUrl={chain.investor.logoUrl} logoColor={chain.investor.logoColor} size={28} radius={4} />
      <div style={{ flex: "1 1 160px", minWidth: 0 }}>
        <p style={{ ...TITLE, fontSize: "14px", overflowWrap: "anywhere" }}>{chain.investor.name}</p>
        <p style={{ ...LABEL, marginTop: "2px" }}>{day(o.createdAt)}</p>
      </div>
      <span style={{ ...DATA, fontSize: "12px", color: "var(--cr-ink-3)", whiteSpace: "nowrap" }}>
        {o.amount != null && o.amount > 0 ? formatMoney(o.amount, o.currency, { compact: true }) : "—"}
      </span>
      <span style={{
        ...BADGE,
        color: accepted ? "var(--verdigris)" : "var(--cr-ink-4)",
        borderColor: accepted ? "color-mix(in srgb, var(--verdigris) 35%, transparent)" : "var(--cr-rule-dark)",
      }}>
        {statusLabel(o.status, t)}
      </span>
      {accepted && (
        <Link
          href={`/dashboard/messages?startupId=${encodeURIComponent(startupId)}&investorId=${encodeURIComponent(chain.investor.id)}`}
          style={{ ...BODY, fontSize: "12px", fontWeight: 500, color: "var(--cr-copper)", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          {t("offerInbox.openConversation")} →
        </Link>
      )}
    </div>
  );
}

// ── Vocabulary ──────────────────────────────────────────────────────────────

type T = (key: string, vars?: Record<string, string | number>) => string;

function instrumentLabel(value: string, t: T): string {
  if (value === "equity") return t("round.equity");
  if (value === "safe") return t("round.safe");
  if (value === "convertible_note") return t("round.note");
  return humanise(value);
}

function statusLabel(status: string, t: T): string {
  if (status === "accepted") return t("offerInbox.statusAccepted");
  if (status === "declined") return t("offerInbox.statusDeclined");
  if (status === "withdrawn") return t("offerInbox.statusWithdrawn");
  if (status === "countered") return t("offerInbox.statusCountered");
  return t("offerInbox.statusPending");
}
