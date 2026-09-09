"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney, type CurrencyCode } from "@/lib/currency";

/**
 * The offer.
 *
 * Contact used to be free and a deal record came later, if ever. It is now the
 * other way round: an investor opens with a number and terms, the founder
 * accepts, declines or counters, and only an accepted offer opens a
 * conversation. So this form is the first thing an investor and a founder ever
 * exchange, and it has one job -- make the offer a real position rather than a
 * hello.
 *
 * Two decisions shape it.
 *
 * The ask sits BESIDE the offer, term by term. An investor taking the listed
 * terms should be one click from sending, and an investor offering something
 * else should be one edit from sending -- with the difference visible in the
 * same row rather than discovered by the founder afterwards. A form that only
 * showed empty fields would make the second case feel like a mistake.
 *
 * The copy never pretends this is a commitment to wire money. It is an opening
 * position, it is on the record, and nothing moves until both sides sign.
 * Saying that plainly is what makes a serious number safe to send.
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
  lineHeight: 1.65, color: "var(--cr-ink-3)",
};

const FIELD: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
  fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)",
  background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px", padding: "10px 12px", width: "100%", minWidth: 0,
  minHeight: "40px",
};

const AREA: CSSProperties = {
  ...FIELD,
  fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
  lineHeight: 1.6, resize: "vertical",
};

/** Card internals stay on the scale at both ends: 16 on a 375px screen, 24 on
 *  a desktop column. Inline styles cannot carry a media query. */
const PAD = "clamp(16px, 4vw, 24px)";

/** The ask column and the offer column, sized so 375px wraps them into one. */
const ASK_COL: CSSProperties = { flex: "1 1 150px", minWidth: 0 };
const OFFER_COL: CSSProperties = { flex: "1 1 210px", minWidth: 0 };

// ── Props ───────────────────────────────────────────────────────────────────

/**
 * What the other side has on the table. On a listing that is the round the
 * founder advertised; on a counter it is the offer being answered. One shape,
 * because the reader's question is the same either way: what am I answering?
 */
export interface OfferAsk {
  amount?: number | null;
  equityPct?: number | null;
  valuation?: number | null;
  instrument?: string | null;
  conditions?: string | null;
  currency?: string | null;
  /** Listings only: the smallest cheque the founder will take. */
  minCheck?: number | null;
}

interface Props {
  startupId: string;
  companyName: string;
  ask?: OfferAsk | null;
  /** "counter" answers an existing proposal instead of opening a new one. */
  mode?: "offer" | "counter";
  /** The proposal being answered. Required when mode is "counter". */
  proposalId?: string;
  onSent?: (proposalId: string | null) => void;
  onCancel?: () => void;
  /** The listing page owns the non-circumvention modal, so a 428 comes back
   *  here and is handed up rather than dead-ending the send. */
  onAckRequired?: () => void;
}

/** The instruments the listings themselves use. Free text is still accepted by
 *  the API (a term sheet is not an enum); this is the short path. */
const INSTRUMENTS = ["equity", "safe", "convertible_note"] as const;

function num(v: string): number | null {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asField(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

/**
 * One term: what they are asking on the left, what you are offering on the
 * right, split by a hairline. At 375px the two stack and still read in that
 * order.
 *
 * Declared at module scope on purpose. Defined inside the composer it would be
 * a new component type on every render, and React would remount the input on
 * every keystroke -- which reads to the user as the field losing focus mid
 * number.
 */
function TermRow({
  label, askValue, askNote, differs, differsLabel, children,
}: {
  label: string;
  askValue: string | null;
  askNote?: string | null;
  differs?: boolean;
  differsLabel: string;
  children: ReactNode;
}) {
  return (
    <div style={{
      borderTop: "1px solid var(--cr-rule)", padding: "12px 0",
      display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-start",
    }}>
      <div style={ASK_COL}>
        <div style={LABEL}>{label}</div>
        <div style={{
          ...DATA, marginTop: "4px", overflowWrap: "anywhere",
          color: askValue ? "var(--cr-ink-2)" : "var(--cr-ink-4)",
        }}>
          {askValue ?? "—"}
        </div>
        {askNote && (
          <div style={{ ...BODY, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{askNote}</div>
        )}
      </div>
      <div style={OFFER_COL}>
        {children}
        {differs && (
          <div style={{ ...LABEL, color: "var(--cr-copper)", marginTop: "4px" }}>{differsLabel}</div>
        )}
      </div>
    </div>
  );
}

export function OfferComposer({
  startupId, companyName, ask, mode = "offer", proposalId, onSent, onCancel, onAckRequired,
}: Props) {
  const { t } = useTranslation();

  const counter = mode === "counter";
  const askCurrency = (ask?.currency as CurrencyCode | undefined) ?? DEFAULT_CURRENCY;

  // Prefilled from the ask, so taking the listed terms is one click. Every
  // field stays editable, so offering something else is one edit.
  const [amount, setAmount] = useState(asField(ask?.amount));
  const [currency, setCurrency] = useState<string>(askCurrency);
  const [equity, setEquity] = useState(asField(ask?.equityPct));
  const [valuation, setValuation] = useState(asField(ask?.valuation));
  const [instrument, setInstrument] = useState(ask?.instrument ?? "");
  const [conditions, setConditions] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const amountNum = num(amount);
  const equityNum = num(equity);
  const valuationNum = num(valuation);

  /** Pro-rata on the round's own arithmetic: a smaller cheque than the whole
   *  raise buys proportionally less of it. Offered as a suggestion, never
   *  written silently -- the investor's number is the investor's to state. */
  const proRata = useMemo(() => {
    if (!ask?.amount || !ask?.equityPct || !amountNum) return null;
    if (amountNum >= ask.amount) return null;
    const pct = Math.round((ask.equityPct * amountNum / ask.amount) * 100) / 100;
    return pct > 0 && String(pct) !== equity ? pct : null;
  }, [ask?.amount, ask?.equityPct, amountNum, equity]);

  const differing = useMemo(() => {
    const d = {
      amount: ask?.amount != null && amountNum != null && amountNum !== ask.amount,
      equity: ask?.equityPct != null && equityNum != null && equityNum !== ask.equityPct,
      valuation: ask?.valuation != null && valuationNum != null && valuationNum !== ask.valuation,
      instrument: !!ask?.instrument && !!instrument && instrument !== ask.instrument,
    };
    return { ...d, count: Object.values(d).filter(Boolean).length };
  }, [ask, amountNum, equityNum, valuationNum, instrument]);

  const instrumentOptions = useMemo(() => {
    const base: string[] = [...INSTRUMENTS];
    if (ask?.instrument && !base.includes(ask.instrument)) base.push(ask.instrument);
    return base;
  }, [ask?.instrument]);

  const instrumentLabel = (slug: string): string => {
    const key = slug === "equity" ? "offerComposer.instrumentEquity"
      : slug === "safe" ? "offerComposer.instrumentSafe"
      : slug === "convertible_note" ? "offerComposer.instrumentNote"
      : null;
    return key ? t(key) : slug.replace(/_/g, " ");
  };

  const money = (v: number | null | undefined): string | null =>
    v == null ? null : formatMoney(v, ask?.currency ?? currency);

  async function send() {
    if (busy) return;
    if (amountNum === null) { notify.error(t("offerComposer.needsAmount")); return; }
    // The API drops an out-of-range percentage rather than storing nonsense,
    // so catch it here: an offer that quietly loses its equity term on the way
    // out is worse than one that refuses to send.
    if (equityNum !== null && equityNum > 100) { notify.error(t("offerComposer.equityRange")); return; }

    const terms = {
      amount: amountNum,
      currency,
      equityPct: equityNum,
      valuation: valuationNum,
      instrument: instrument || null,
      conditions: conditions.trim() || null,
      note: note.trim() || null,
    };

    setBusy(true);
    try {
      const res = await fetch("/api/deals/proposals", {
        method: counter ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          counter ? { id: proposalId, action: "counter", ...terms } : { startupId, ...terms },
        ),
      });
      const j = await res.json().catch(() => ({}));
      // The listing page owns the non-circumvention modal; it re-opens, and
      // the offer stays in the form so nothing typed is lost.
      if (res.status === 428) { onAckRequired?.(); notify.info(t("offerComposer.needsAck")); return; }
      if (!res.ok) { notify.error(j.error || t("offerComposer.failed")); return; }
      notify.success(counter ? t("offerComposer.counterSent") : t("offerComposer.sent"));
      onSent?.(j.proposal?.id ?? null);
    } catch {
      notify.error(t("offerComposer.failed"));
    } finally {
      setBusy(false);
    }
  }

  const differsLabel = t("offerComposer.differs");

  return (
    <div style={{
      background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
      borderRadius: "4px", boxShadow: "var(--cr-card-shadow)", padding: PAD,
    }}>
      <div className="ruled-label" style={{ marginBottom: "12px" }}>
        <span aria-hidden style={{ ...DATA, fontSize: "11px", fontWeight: 600, color: "var(--cr-copper)" }}>✦</span>
        <span>{counter ? t("offerComposer.eyebrowCounter") : t("offerComposer.eyebrow")}</span>
      </div>

      <h2 style={{
        fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "clamp(22px, 3vw, 28px)",
        lineHeight: 1.15, color: "var(--cr-ink)", margin: "0 0 8px",
      }}>
        {counter
          ? t("offerComposer.titleCounter", { company: companyName })
          : t("offerComposer.title", { company: companyName })}
      </h2>
      <p style={{ ...BODY, maxWidth: "62ch", marginBottom: "24px" }}>
        {counter ? t("offerComposer.leadCounter") : t("offerComposer.lead")}
      </p>

      {/* Column headers. The ask is never behind a disclosure: it is the thing
          the offer is answering. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "4px" }}>
        <span className="ruled-label" style={ASK_COL}>
          {counter ? t("offerComposer.theirOfferTitle") : t("offerComposer.askTitle")}
        </span>
        <span className="ruled-label" style={OFFER_COL}>{t("offerComposer.offerTitle")}</span>
      </div>

      <TermRow
        label={counter ? t("offerComposer.askAmount") : t("offerComposer.askRaising")}
        askValue={money(ask?.amount)}
        askNote={ask?.minCheck ? t("offerComposer.askMinCheck", { amount: formatMoney(ask.minCheck, ask?.currency ?? currency, { compact: true }) }) : null}
        differs={differing.amount}
        differsLabel={differsLabel}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            value={amount} onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal" aria-label={t("offerComposer.amount")}
            placeholder={t("offerComposer.amountPlaceholder")}
            style={{ ...FIELD, flex: "1 1 auto" }}
          />
          <select
            value={currency} onChange={(e) => setCurrency(e.target.value)}
            aria-label={t("offerComposer.currency")}
            style={{ ...FIELD, width: "auto", flex: "0 0 auto", cursor: "pointer" }}
          >
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        {amountNum !== null && (
          <div style={{ ...DATA, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
            {formatMoney(amountNum, currency)}
          </div>
        )}
      </TermRow>

      <TermRow
        label={t("offerComposer.askEquity")}
        askValue={ask?.equityPct != null ? `${ask.equityPct}%` : null}
        differs={differing.equity}
        differsLabel={differsLabel}
      >
        <input
          value={equity} onChange={(e) => setEquity(e.target.value)}
          inputMode="decimal" aria-label={t("offerComposer.equity")}
          placeholder={t("offerComposer.equityPlaceholder")}
          style={FIELD}
        />
        {proRata !== null && (
          <button type="button" onClick={() => setEquity(String(proRata))}
            style={{
              background: "none", border: "none", padding: "4px 0", cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
              fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)",
            }}>
            {t("offerComposer.proRata", { pct: proRata })} &rarr;
          </button>
        )}
      </TermRow>

      <TermRow
        label={t("offerComposer.askValuation")}
        askValue={money(ask?.valuation)}
        differs={differing.valuation}
        differsLabel={differsLabel}
      >
        <input
          value={valuation} onChange={(e) => setValuation(e.target.value)}
          inputMode="decimal" aria-label={t("offerComposer.valuation")}
          placeholder={t("offerComposer.valuationPlaceholder")}
          style={FIELD}
        />
        {valuationNum !== null && (
          <div style={{ ...DATA, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
            {formatMoney(valuationNum, currency)}
          </div>
        )}
      </TermRow>

      <TermRow
        label={t("offerComposer.askInstrument")}
        askValue={ask?.instrument ? instrumentLabel(ask.instrument) : null}
        differs={differing.instrument}
        differsLabel={differsLabel}
      >
        <select
          value={instrument} onChange={(e) => setInstrument(e.target.value)}
          aria-label={t("offerComposer.instrument")}
          style={{ ...FIELD, cursor: "pointer" }}
        >
          <option value="">{t("offerComposer.instrumentUnset")}</option>
          {instrumentOptions.map((slug) => (
            <option key={slug} value={slug}>{instrumentLabel(slug)}</option>
          ))}
        </select>
      </TermRow>

      <TermRow
        label={t("offerComposer.askConditions")}
        askValue={ask?.conditions ? ask.conditions : null}
        differsLabel={differsLabel}
      >
        <textarea
          value={conditions} onChange={(e) => setConditions(e.target.value)}
          rows={2} maxLength={2000} aria-label={t("offerComposer.conditions")}
          placeholder={t("offerComposer.conditionsPlaceholder")}
          style={AREA}
        />
      </TermRow>

      {/* The note is the one part with no counterpart in the ask, so it gets
          the full width instead of an empty column beside it. */}
      <div style={{ borderTop: "1px solid var(--cr-rule)", padding: "12px 0" }}>
        <div style={LABEL}>{t("offerComposer.note")}</div>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)}
          rows={3} maxLength={2000} aria-label={t("offerComposer.note")}
          placeholder={t("offerComposer.notePlaceholder")}
          style={{ ...AREA, marginTop: "8px" }}
        />
      </div>

      {differing.count > 0 && (
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-2)", borderTop: "1px solid var(--cr-rule)", paddingTop: "12px", margin: 0 }}>
          {t("offerComposer.differsCount", { count: differing.count })}
        </p>
      )}

      <div style={{
        borderTop: "1px solid var(--cr-rule-dark)", marginTop: "24px", paddingTop: "16px",
        display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px",
      }}>
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", flex: "1 1 260px", margin: 0 }}>
          {t("offerComposer.footnote")}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={busy}
              style={{
                background: "none", border: "none", padding: "8px 0", cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
                color: "var(--cr-ink-4)", minHeight: "40px",
              }}>
              {t("offerComposer.cancel")}
            </button>
          )}
          <button type="button" onClick={send} disabled={busy || amountNum === null}
            style={{
              background: "var(--cr-copper)", border: "1px solid var(--cr-copper-d)",
              borderRadius: "999px", padding: "0 24px", minHeight: "40px", cursor: busy ? "wait" : "pointer",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
              color: "var(--cr-band-ink)", opacity: busy || amountNum === null ? 0.6 : 1,
            }}>
            {busy
              ? t("offerComposer.sending")
              : counter ? t("offerComposer.sendCounter") : t("offerComposer.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
