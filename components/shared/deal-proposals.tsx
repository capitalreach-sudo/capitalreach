"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Check, Handshake } from "lucide-react";
import { EntityLogo } from "@/components/shared/entity-logo";
import { OfferComposer, type OfferAsk } from "@/components/deals/offer-composer";
import { notify } from "@/components/ui/toast-notify";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useLocale } from "@/components/providers/locale-provider";
import { useTranslation } from "@/hooks/useTranslation";
import { formatMoney } from "@/lib/currency";

/**
 * The negotiation, on the board it gates.
 *
 * Everything that happens before a deal exists happens here. An offer arrives
 * carrying a number AND terms, and there are three answers to it: take it,
 * pass on it, or put a different number back on the table. Incoming rounds sit
 * above the pipeline because they are the one thing on this page somebody else
 * is waiting on.
 *
 * Three things the markup is built around.
 *
 *   Every term is on the card. Answering a figure you cannot see is not a
 *   decision, and the amount alone is not the offer -- equity, valuation,
 *   instrument and conditions are what is actually being agreed.
 *
 *   A counter is an answer, not a new subject. It is written in the same
 *   composer an investor opens with, prefilled with the terms it answers, so
 *   the person changes the one number they disagree with and leaves the rest
 *   standing. Both sides get it: an investor who receives a counter has to be
 *   able to answer it somewhere, and this is the only surface both sides open.
 *
 *   A negotiation reads as a negotiation. Counters are linked to the round they
 *   answer, so three rounds are one card with its history, oldest first, and
 *   each term that moved says what it moved from.
 */

// ── House register (docs/DESIGN-SPEC.md) ────────────────────────────────────

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const DATA: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
  fontWeight: 500, fontSize: "13px", letterSpacing: "0.02em", color: "var(--cr-ink-2)",
};

const BODY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  lineHeight: 1.6, color: "var(--cr-ink-3)",
};

const NAME: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px",
  color: "var(--cr-ink)", margin: 0,
};

const PRIMARY: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: "var(--cr-copper)", color: "var(--cr-band-ink)", border: "none",
  borderRadius: 999, minHeight: 40, padding: "0 16px", cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
};

const SECONDARY: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: "transparent", color: "var(--cr-ink)",
  border: "1px solid var(--cr-paper-4)", borderRadius: 999, minHeight: 40,
  padding: "0 16px", cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 13,
};

const QUIET: CSSProperties = {
  display: "inline-flex", alignItems: "center", background: "none", border: "none",
  minHeight: 40, padding: "0 8px", cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 12,
  color: "var(--cr-ink-4)", textDecoration: "underline",
};

const RULE = "1px solid var(--cr-rule)";

// ── The payload ─────────────────────────────────────────────────────────────

/** One round. GET /api/deals/proposals returns every term; this surface used
 *  to read the amount and drop the rest. */
type Proposal = {
  id: string;
  direction: "incoming" | "outgoing";
  fromSide: "startup" | "investor";
  amount: number | null;
  currency: string | null;
  equityPct: number | null;
  valuation: number | null;
  instrument: string | null;
  conditions: string | null;
  /** Set when this round answers an earlier one. */
  countersId: string | null;
  note: string | null;
  createdAt: string;
  counterpart: { kind: string; name: string; slug?: string; logoUrl: string | null; logoColor: string | null };
};

/** One negotiation: the terms on the table, and the rounds behind them. */
type Chain = { key: string; head: Proposal; trail: Proposal[] };

/** A malformed chain must not be able to spin the walk below. */
const MAX_CHAIN_DEPTH = 40;

/**
 * A counter is a new proposal pointing at the one it answers, so a negotiation
 * is a linked list. Walking each round back to its root groups them into one
 * card instead of leaving them as unrelated offers.
 *
 * A parent outside the payload ends the walk: the API returns only rounds that
 * are still pending, so today a chain usually arrives as its head alone. A
 * truncated chain still reads correctly -- oldest first, live terms last.
 */
function buildChains(rows: Proposal[]): Chain[] {
  const byId = new Map<string, Proposal>(rows.map((r) => [r.id, r]));
  const groups = new Map<string, Proposal[]>();

  for (const r of rows) {
    let root = r;
    const seen = new Set<string>([r.id]);
    for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
      const parent = root.countersId ? byId.get(root.countersId) : undefined;
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      root = parent;
    }
    const list = groups.get(root.id);
    if (list) list.push(r); else groups.set(root.id, [r]);
  }

  return Array.from(groups.entries())
    .map(([key, list]) => {
      const trail = list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { key, head: trail[trail.length - 1], trail };
    })
    // The round that landed this morning is the one being answered today.
    .sort((a, b) => b.head.createdAt.localeCompare(a.head.createdAt));
}

/** The terms being answered, in the shape the composer already reads. */
function termsOf(p: Proposal): OfferAsk {
  return {
    amount: p.amount,
    equityPct: p.equityPct,
    valuation: p.valuation,
    instrument: p.instrument,
    conditions: p.conditions,
    currency: p.currency,
  };
}

// ── The surface ─────────────────────────────────────────────────────────────

export function DealProposals({ onChanged, variant = "strip" }: { onChanged?: () => void; variant?: "strip" | "column" }) {
  const { t } = useTranslation();
  const [incoming, setIncoming] = useState<Proposal[]>([]);
  const [outgoing, setOutgoing] = useState<Proposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [countering, setCountering] = useState<Proposal | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/deals/proposals");
    if (!res.ok) { setLoaded(true); return; }
    const j = await res.json();
    setIncoming(j.incoming ?? []);
    setOutgoing(j.outgoing ?? []);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const chains = useMemo(
    () => buildChains([...incoming, ...outgoing]),
    [incoming, outgoing],
  );

  const closeCounter = useCallback(() => setCountering(null), []);
  useEscapeKey(countering !== null, closeCounter);

  const act = useCallback(async (id: string, action: "accept" | "decline" | "withdraw") => {
    if (busy) return;
    setBusy(id);
    const res = await fetch("/api/deals/proposals", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); void load(); return; }
    if (action === "accept") notify.success(t("proposals.accepted"));
    void load();
    onChanged?.();
  }, [busy, load, onChanged, t]);

  const counterSent = useCallback(() => {
    setCountering(null);
    void load();
    onChanged?.();
  }, [load, onChanged]);

  const dialog = countering && (
    <CounterDialog proposal={countering} onClose={closeCounter} onSent={counterSent} />
  );

  if (variant === "column") {
    return (
      <div style={{ width: "264px", flexShrink: 0, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 260px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: 3, padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cr-copper)" }}>
            <Handshake style={{ width: 11, height: 11 }} /> {t("deals.colProposal")}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)" }}>{chains.length}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", paddingRight: "2px", minHeight: 0 }}>
          {chains.length === 0 ? (
            <div style={{ border: "1px dashed var(--cr-rule-dark)", borderRadius: 4, padding: "16px 12px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 11, color: "var(--cr-ink-4)" }}>
              <span aria-hidden style={{ display: "block", color: "var(--cr-copper)", marginBottom: 8 }}>✦</span>
              {t("proposals.emptyColumn")}
            </div>
          ) : chains.map((c) => (
            <ProposalCard
              key={c.key} chain={c} compact busy={busy === c.head.id}
              onAct={act} onCounter={setCountering}
            />
          ))}
        </div>
        {dialog}
      </div>
    );
  }

  if (!loaded || chains.length === 0) return null;

  return (
    <section style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: 4, padding: "16px", marginBottom: 24 }}>
      <p className="ruled-label" style={{ marginBottom: 4 }}>
        {t("proposals.title")}
      </p>
      {chains.map((c) => (
        <ProposalCard
          key={c.key} chain={c} compact={false} busy={busy === c.head.id}
          onAct={act} onCounter={setCountering}
        />
      ))}
      {dialog}
    </section>
  );
}

// ── One negotiation ─────────────────────────────────────────────────────────

/** One term, and what it was before this round moved it. */
type Cell = { key: string; label: string; value: string | null; was: string | null };

function ProposalCard({ chain, compact, busy, onAct, onCounter }: {
  chain: Chain;
  compact: boolean;
  busy: boolean;
  onAct: (id: string, action: "accept" | "decline" | "withdraw") => void;
  onCounter: (p: Proposal) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [showTrail, setShowTrail] = useState(false);

  const p = chain.head;
  // The round this one answers, when the payload carries it. It is what the
  // terms below are read against: a counter is only legible next to the number
  // it moved.
  const prev = chain.trail.length > 1 ? chain.trail[chain.trail.length - 2] : null;
  const incoming = p.direction === "incoming";

  const instrumentLabel = (slug: string): string =>
    slug === "equity" ? t("offerComposer.instrumentEquity")
      : slug === "safe" ? t("offerComposer.instrumentSafe")
      : slug === "convertible_note" ? t("offerComposer.instrumentNote")
      : slug.replace(/_/g, " ");

  const money = (v: number | null, currency: string | null): string | null =>
    v == null ? null : formatMoney(v, currency, { compact });

  const stamp = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  };

  const was = (value: string | null): string =>
    value ? t("proposals.wasBefore", { value }) : t("proposals.wasUnset");

  const cells: Cell[] = [
    {
      key: "amount",
      label: t("proposals.amount"),
      value: money(p.amount, p.currency),
      was: prev && (prev.amount !== p.amount || prev.currency !== p.currency)
        ? was(money(prev.amount, prev.currency)) : null,
    },
    {
      key: "equity",
      label: t("proposals.equity"),
      value: p.equityPct != null ? `${p.equityPct}%` : null,
      was: prev && prev.equityPct !== p.equityPct
        ? was(prev.equityPct != null ? `${prev.equityPct}%` : null) : null,
    },
    {
      key: "valuation",
      label: t("proposals.valuation"),
      value: money(p.valuation, p.currency),
      was: prev && prev.valuation !== p.valuation
        ? was(money(prev.valuation, prev.currency)) : null,
    },
    {
      key: "instrument",
      label: t("proposals.instrument"),
      value: p.instrument ? instrumentLabel(p.instrument) : null,
      was: prev && (prev.instrument ?? null) !== (p.instrument ?? null)
        ? was(prev.instrument ? instrumentLabel(prev.instrument) : null) : null,
    },
  ];

  // A narrow board column cannot carry four terms and their history; the page
  // strip can. Both show the amount, which is never dropped.
  const shown = compact ? cells.filter((c) => c.value !== null) : cells;
  const conditionsChanged = !!prev && (prev.conditions ?? "") !== (p.conditions ?? "");

  const actions = incoming ? (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => onAct(p.id, "accept")} disabled={busy}
          style={{ ...PRIMARY, flex: compact ? "1 1 96px" : "0 0 auto", opacity: busy ? 0.45 : 1 }}>
          <Check style={{ width: 12, height: 12 }} /> {t("proposals.accept")}
        </button>
        {/* The third answer. Without it this card can only say yes or no to a
            number somebody else chose. */}
        <button onClick={() => onCounter(p)} disabled={busy}
          style={{ ...SECONDARY, flex: compact ? "1 1 96px" : "0 0 auto", opacity: busy ? 0.45 : 1 }}>
          <ArrowLeftRight style={{ width: 12, height: 12 }} /> {t("proposals.counter")}
        </button>
        {!compact && (
          <button onClick={() => onAct(p.id, "decline")} disabled={busy} style={QUIET}>
            {t("proposals.decline")}
          </button>
        )}
      </div>
      {compact && (
        <button onClick={() => onAct(p.id, "decline")} disabled={busy}
          style={{ ...QUIET, padding: "0 4px", marginLeft: -4 }}>
          {t("proposals.decline")}
        </button>
      )}
      {!compact && (
        <p style={{ ...BODY, fontSize: 12, color: "var(--cr-ink-4)", marginTop: 8, maxWidth: "62ch" }}>
          {t("proposals.acceptOpens")}
        </p>
      )}
    </>
  ) : (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ ...LABEL, textTransform: "none", letterSpacing: "normal", fontSize: 12 }}>
        {t("proposals.waiting")}
      </span>
      <button onClick={() => onAct(p.id, "withdraw")} disabled={busy} style={{ ...QUIET, fontSize: 11 }}>
        {t("proposals.withdraw")}
      </button>
    </div>
  );

  return (
    <div style={compact
      ? { background: "var(--cr-paper-2)", border: "1px solid var(--cr-copper-br)", borderRadius: 4, padding: 12 }
      : { borderTop: RULE, padding: "16px 0" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: compact ? 8 : 12, flexWrap: "wrap" }}>
        <EntityLogo name={p.counterpart.name} logoUrl={p.counterpart.logoUrl} logoColor={p.counterpart.logoColor} size={compact ? 28 : 36} radius={4} />
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <p style={{ ...NAME, fontSize: compact ? 13 : 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.counterpart.name}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            {/* Which round this is, said on the card rather than left to be
                inferred from a number that changed since last week. */}
            <span style={{ ...LABEL, color: p.countersId ? "var(--cr-copper)" : "var(--cr-ink-4)" }}>
              {p.countersId ? t("proposals.counterOffer") : t("proposals.openingOffer")}
            </span>
            <span style={{ ...LABEL }}>{stamp(p.createdAt)}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: 0 }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
            fontWeight: 700, fontSize: compact ? 13 : 15, color: "var(--cr-copper)",
          }}>
            {p.amount != null ? formatMoney(p.amount, p.currency, { compact }) : t("proposals.notStated")}
          </span>
        </div>
      </div>

      {/* The terms. All four on the strip, present or not: a round that states
          no equity is saying something, and an empty row says it. */}
      <div style={compact
        ? { marginTop: 8 }
        : { marginTop: 12, display: "flex", flexWrap: "wrap", gap: "12px 24px" }}
      >
        {shown.map((c) => (
          <div key={c.key} style={compact
            ? { borderTop: RULE, padding: "5px 0", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }
            : { flex: "1 1 120px", minWidth: 0 }}
          >
            <span style={LABEL}>{c.label}</span>
            <span style={{
              ...DATA, display: compact ? "inline" : "block",
              fontSize: compact ? 11 : 13,
              marginTop: compact ? 0 : 3,
              color: c.value ? "var(--cr-ink)" : "var(--cr-ink-4)",
              overflowWrap: "anywhere", textAlign: compact ? "right" : "left",
            }}>
              {c.value ?? t("proposals.notStated")}
            </span>
            {c.was && !compact && (
              <span style={{ ...LABEL, display: "block", color: "var(--cr-copper)", marginTop: 3 }}>{c.was}</span>
            )}
          </div>
        ))}
      </div>

      {p.conditions && (
        <div style={{ borderTop: RULE, marginTop: compact ? 6 : 12, paddingTop: 8 }}>
          <span style={LABEL}>{t("proposals.conditions")}</span>
          {conditionsChanged && (
            <span style={{ ...LABEL, color: "var(--cr-copper)", marginLeft: 8 }}>{t("proposals.changed")}</span>
          )}
          <p style={{ ...BODY, fontSize: compact ? 11 : 13, color: "var(--cr-ink-2)", marginTop: 3, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {p.conditions}
          </p>
        </div>
      )}

      {p.note && (
        <div style={{ borderTop: RULE, marginTop: compact ? 6 : 12, paddingTop: 8 }}>
          <span style={LABEL}>{incoming ? t("proposals.theirNote") : t("proposals.yourNote")}</span>
          <p style={{ ...BODY, fontSize: compact ? 11 : 13, color: "var(--cr-ink-2)", marginTop: 3, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {p.note}
          </p>
        </div>
      )}

      {/* The rounds behind the one on the table, folded away: history must not
          outweigh the terms being answered. */}
      {chain.trail.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setShowTrail((v) => !v)} aria-expanded={showTrail}
            style={{ ...QUIET, padding: 0, fontSize: 11 }}>
            {showTrail ? t("proposals.historyHide") : t("proposals.historyShow", { count: chain.trail.length })}
          </button>
          <div style={{
            display: "grid",
            gridTemplateRows: showTrail ? "1fr" : "0fr",
            transition: "grid-template-rows 200ms var(--ease-out)",
          }}>
            <div style={{ minHeight: 0, overflow: "hidden", visibility: showTrail ? "visible" : "hidden" }}>
              <div style={{ marginTop: 4 }}>
                {chain.trail.map((step, i) => (
                  <div key={step.id} style={{ borderTop: RULE, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "6px 0" }}>
                    <span style={{ ...BODY, fontSize: 12, color: "var(--cr-ink-2)", minWidth: 0 }}>
                      {t("proposals.roundN", { n: i + 1 })}
                      {" · "}
                      {step.direction === "outgoing" ? t("proposals.sideYou") : t("proposals.sideThem")}
                      {" · "}
                      {step.amount != null ? formatMoney(step.amount, step.currency, { compact: true }) : t("proposals.notStated")}
                    </span>
                    <span style={{ ...DATA, fontSize: 11, color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                      {stamp(step.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ borderTop: RULE, marginTop: compact ? 8 : 12, paddingTop: 12 }}>
        {actions}
      </div>
    </div>
  );
}

// ── Countering ──────────────────────────────────────────────────────────────

/**
 * The composer an investor writes their opening offer in, answering a round
 * instead of opening one. It is raised over the board because the board is
 * where both sides read their proposals, and in a 264px column a term sheet
 * has nowhere to stand.
 */
function CounterDialog({ proposal, onClose, onSent }: {
  proposal: Proposal;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("proposals.counterAria", { name: proposal.counterpart.name })}
      style={{
        position: "fixed", inset: 0, zIndex: 80, overflowY: "auto",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "clamp(16px, 6vh, 64px) 16px",
        background: "color-mix(in srgb, var(--cr-ink) 55%, transparent)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "640px" }}>
        <OfferComposer
          // A counter is answered by proposal id and the route derives the
          // pair, the sides and the acknowledgment from it. The listing id is
          // not in this payload, and the composer reads it only when opening a
          // new offer.
          startupId=""
          companyName={proposal.counterpart.name}
          ask={termsOf(proposal)}
          mode="counter"
          proposalId={proposal.id}
          onSent={onSent}
          onCancel={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}
