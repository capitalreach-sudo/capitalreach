"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";
import { formatMoney } from "@/lib/currency";
import { DUNNING_DAYS } from "@/lib/fees";

/**
 * Everything the platform is owed by this founder, and what happens if it goes
 * unpaid.
 *
 * The fee arrives as an invoice on the day a round closes, which is the worst
 * day to ask a founder for cash. Until now the platform's whole answer to a
 * founder who could not pay was three reminders and then silence -- and, from
 * 118, a consequence that arrived without ever having been stated. So this page
 * says all of it in advance: the deal, the amount raised, the 2%, the invoice
 * state, the date of the next step, and the single action that reverses it.
 *
 * Three doors are always open, in this order: pay it, spread it, or say it is
 * wrong. A founder who cannot pay today needs a door that is not silence.
 *
 * The register is deliberately flat. Nobody is scolded here. Red and green mean
 * money direction and nothing else, so an unpaid fee is not painted as an
 * alarm; it is a fact with a date attached.
 */

// ── House register ──────────────────────────────────────────────────────────

const MONO: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
};

const BODY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, lineHeight: 1.65,
};

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.07em",
};

const CARD: CSSProperties = {
  background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};

const BADGE: CSSProperties = {
  ...LABEL, fontSize: "9px", borderRadius: "3px", padding: "3px 6px",
  border: "1px solid var(--cr-rule-dark)", whiteSpace: "nowrap", flexShrink: 0,
};

const BTN_PRIMARY: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: "40px", padding: "0 18px", borderRadius: "999px",
  background: "var(--cr-copper)", border: "1px solid var(--cr-copper)",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
  color: "#FFFFFF", textDecoration: "none", whiteSpace: "nowrap", cursor: "pointer",
};

const BTN_OUTLINE: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: "40px", padding: "0 16px", borderRadius: "999px",
  background: "transparent", border: "1px solid var(--cr-paper-4)",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
  color: "var(--cr-ink)", textDecoration: "none", whiteSpace: "nowrap", cursor: "pointer",
};

const BTN_TEXT: CSSProperties = {
  display: "inline-flex", alignItems: "center", minHeight: "40px", padding: 0,
  background: "none", border: "none", fontFamily: "'DM Sans', sans-serif",
  fontWeight: 600, fontSize: "12px", cursor: "pointer",
};

// ── The shape the route returns ─────────────────────────────────────────────

type FeeStateName = "collected" | "outstanding" | "unbillable" | "waived" | "disputed" | "reversed";
type Step = "none" | "reminded" | "listing_paused" | "account_restricted" | "resolved";

interface Fee {
  id: string;
  raised: number | null;
  currency: string | null;
  closedAt: string | null;
  feeMajor: number;
  state: FeeStateName;
  investorName: string | null;
  disputeReason: string | null;
  disputeResolution: string | null;
  resolvedAt: string | null;
  invoiced: boolean;
  planMonths: number | null;
  overdueInstalment: { seq: number; due: string } | null;
  enforcement: Step | null;
  enforcedAt: string | null;
  pausedFrom: string | null;
  frozen: boolean;
  next: { step: Step; on: string } | null;
  payUrl: string | null;
}

interface Enforcement {
  enabled: boolean;
  pauseDays: number;
  restrictDays: number;
  listingPaused: boolean;
  accountRestricted: boolean;
  since: string | null;
  roundState: string | null;
  justLifted: number;
  restoredTo: string | null;
}

/** Handles both full timestamps and YYYY-MM-DD without sliding a day. */
function day(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function isPast(ymd: string): boolean {
  return ymd.length === 10 && ymd <= new Date().toISOString().slice(0, 10);
}

export function FeePortal() {
  const { t } = useTranslation();
  const [fees, setFees] = useState<Fee[] | null>(null);
  const [enforcement, setEnforcement] = useState<Enforcement | null>(null);
  const [failed, setFailed] = useState(false);

  // A failed load must never leave `fees` as [], and must never be read as one:
  // an empty array here is the sentence "no fee is outstanding", which is a
  // claim about money that an unread ledger cannot make. So failure keeps the
  // last known ledger (or null) and is answered by its own branch below, and
  // only a body that actually carries a list of fees counts as an answer.
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/fees/mine");
      if (!res.ok) { setFailed(true); return; }
      const json = await res.json();
      if (!Array.isArray(json.fees)) { setFailed(true); return; }
      setFees(json.fees);
      setEnforcement(json.enforcement ?? null);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (failed) return <LoadFailed onRetry={load} />;

  if (fees === null) {
    // Real layout with suppressed values, not a skeleton: absence is "—".
    return (
      <p style={{ ...MONO, fontSize: "11px", color: "var(--cr-ink-4)" }}>—</p>
    );
  }

  const open = fees.filter(f => f.state === "outstanding" || f.state === "unbillable" || f.state === "disputed");
  const settled = fees.filter(f => !open.includes(f));

  const owed = open.reduce((sum, f) => sum + f.feeMajor, 0);
  const paid = fees.filter(f => f.state === "collected").reduce((sum, f) => sum + f.feeMajor, 0);
  const currency = fees[0]?.currency ?? null;

  // One primary action per view. With several unpaid fees the oldest payable
  // one carries the copper button and the rest are quiet outlines -- otherwise
  // a founder with three invoices gets three equally loud demands.
  const primaryPayId = [...open].reverse().find(f => f.payUrl)?.id ?? null;

  return (
    <>
      {enforcement && <Standing e={enforcement} />}

      {fees.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--cr-copper)", fontSize: "14px", marginBottom: "12px" }} aria-hidden>✦</p>
          <p style={{ ...BODY, fontSize: "14px", color: "var(--cr-ink-3)", marginBottom: "16px" }}>
            {t("feePortal.empty")}
          </p>
          <Link href="/dashboard/startup" style={{ ...BTN_TEXT, color: "var(--cr-copper)", textDecoration: "none" }}>
            {t("feePortal.emptyAction")} →
          </Link>
        </div>
      ) : (
        <>
          {/* Metrics strip: only the figures that have a value. */}
          <div style={{ ...CARD, display: "flex", flexWrap: "wrap", marginBottom: "32px" }}>
            {owed > 0 && (
              <Metric label={t("feePortal.owedNow")} value={formatMoney(owed, currency)} tone="var(--cr-copper)" />
            )}
            {paid > 0 && (
              <Metric label={t("feePortal.paidToDate")} value={formatMoney(paid, currency)} tone="var(--verdigris)" divided={owed > 0} />
            )}
            {owed === 0 && paid === 0 && (
              <Metric label={t("feePortal.owedNow")} value="—" tone="var(--cr-ink-4)" />
            )}
          </div>

          {open.length > 0 && (
            <section style={{ marginBottom: "48px" }}>
              <div className="ruled-label" style={{ marginBottom: "8px" }}>{t("feePortal.sectionOwed")}</div>
              <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "16px", maxWidth: "60ch" }}>
                {t("feePortal.intro")}
              </p>
              <div style={CARD}>
                {open.map((f, i) => (
                  <FeeRow key={f.id} fee={f} first={i === 0} primary={f.id === primaryPayId} onChanged={load} />
                ))}
              </div>
            </section>
          )}

          {settled.length > 0 && (
            <section style={{ marginBottom: "48px" }}>
              <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("feePortal.sectionSettled")}</div>
              <div style={CARD}>
                {settled.map((f, i) => (
                  <FeeRow key={f.id} fee={f} first={i === 0} primary={false} onChanged={load} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {enforcement?.enabled && <Ladder e={enforcement} />}
    </>
  );
}

/**
 * The ledger could not be read.
 *
 * Says only that, and offers the read again. It states nothing about the
 * balance in either direction: a founder whose fees fail to load is not owed
 * the reassurance that they owe nothing, and a listing now pauses on an unpaid
 * fee, so the silent version of this screen is the expensive one.
 */
function LoadFailed({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function retry() {
    if (busy) return;
    setBusy(true);
    try { await onRetry(); } finally { setBusy(false); }
  }

  return (
    <div style={{ ...CARD, padding: "20px" }}>
      <p style={{ ...BODY, fontSize: "14px", color: "var(--cr-ink)", margin: 0 }}>
        {t("feePortal.loadFailed")}
      </p>
      <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-3)", marginTop: "8px", maxWidth: "60ch" }}>
        {t("feePortal.loadFailedNote")}
      </p>
      <button onClick={retry} disabled={busy} style={{ ...BTN_OUTLINE, marginTop: "12px", opacity: busy ? 0.6 : 1 }}>
        {t("errorPage.tryAgain")}
      </button>
    </div>
  );
}

function Metric({ label, value, tone, divided }: { label: string; value: string; tone: string; divided?: boolean }) {
  return (
    <div style={{
      flex: "1 1 160px", padding: "16px 20px",
      borderLeft: divided ? "1px solid var(--cr-rule)" : "none",
    }}>
      <p style={{ ...LABEL, color: "var(--cr-ink-4)", marginBottom: "6px" }}>{label}</p>
      <p style={{ ...MONO, fontWeight: 700, fontSize: "15px", color: tone, margin: 0 }}>{value}</p>
    </div>
  );
}

/**
 * What is being held right now, stated once at the top.
 *
 * Firm and unembarrassed: what happened, since when, what is untouched, and the
 * one thing that reverses it. No apology, no warning, no adjectives.
 */
function Standing({ e }: { e: Enforcement }) {
  const { t } = useTranslation();

  if (e.justLifted > 0) {
    return (
      <div style={{
        display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "32px",
        padding: "16px 20px", borderRadius: "4px",
        background: "color-mix(in srgb, var(--verdigris) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--verdigris) 25%, transparent)",
      }}>
        <span aria-hidden style={{ color: "var(--verdigris)", fontSize: "13px", lineHeight: 1.4 }}>✦</span>
        <div>
          <p style={{ ...LABEL, color: "var(--verdigris)", marginBottom: "4px" }}>{t("feePortal.liftedTitle")}</p>
          <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", margin: 0 }}>
            {t("feePortal.liftedBody")}
            {e.restoredTo ? ` ${t("feePortal.liftedRestored", { state: t(`feePortal.roundState.${e.restoredTo}`) })}` : ""}
          </p>
        </div>
      </div>
    );
  }

  if (!e.listingPaused && !e.accountRestricted) return null;

  return (
    <div style={{
      display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "32px",
      padding: "16px 20px", borderRadius: "4px",
      background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)",
    }}>
      <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "13px", lineHeight: 1.4 }}>✦</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ ...LABEL, color: "var(--cr-copper)", marginBottom: "6px" }}>
          {e.accountRestricted ? t("feePortal.restrictedTitle") : t("feePortal.pausedTitle")}
        </p>
        <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", margin: 0, maxWidth: "60ch" }}>
          {e.accountRestricted ? t("feePortal.restrictedBody") : t("feePortal.pausedBody")}
        </p>
        <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", marginTop: "8px", maxWidth: "60ch" }}>
          {t("feePortal.reverses")}
        </p>
        {e.since && (
          <p style={{ ...MONO, fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "8px" }}>
            {t("feePortal.heldSince", { date: day(e.since) })}
          </p>
        )}
      </div>
    </div>
  );
}

/** One fee: the deal it came from, the arithmetic, the state, the next date. */
function FeeRow({ fee, first, primary, onChanged }: { fee: Fee; first: boolean; primary: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Verdigris is the settled state; everything still open is copper; nothing
  // here is red, because an unpaid invoice is not a loss.
  const tone: Record<FeeStateName, string> = {
    collected: "var(--verdigris)", waived: "var(--verdigris)", reversed: "var(--cr-ink-4)",
    outstanding: "var(--cr-copper)", unbillable: "var(--cr-ink-3)", disputed: "var(--cr-copper)",
  };

  async function submitDispute() {
    if (!reason.trim()) { notify.error(t("myFees.disputeNeedsReason")); return; }
    setBusy(true);
    const res = await fetch("/api/fees/mine", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId: fee.id, reason }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(j.error || t("common.error")); return; }
    setDisputing(false); setReason("");
    notify.success(t("myFees.disputeOpened"));
    onChanged();
  }

  const canAct = fee.state === "outstanding" || fee.state === "unbillable";

  return (
    <div style={{ padding: "20px", borderTop: first ? "none" : "1px solid var(--cr-rule)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ ...MONO, fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", margin: 0, lineHeight: 1.2 }}>
            {formatMoney(fee.feeMajor, fee.currency)}
          </p>
          <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
            {fee.raised != null && (
              <>{t("feePortal.ofRaised", { raised: formatMoney(fee.raised, fee.currency) })} · </>
            )}
            {fee.investorName ?? t("myFees.anInvestor")}
            {fee.closedAt && (
              <> · {t("feePortal.closedLabel")} <span style={{ ...MONO, fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)" }}>{day(fee.closedAt)}</span></>
            )}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {fee.payUrl && (
            <a href={fee.payUrl} target="_blank" rel="noopener noreferrer"
              style={primary ? BTN_PRIMARY : BTN_OUTLINE}>
              {t("feePortal.pay")} ↗
            </a>
          )}
          <span style={{ ...BADGE, color: tone[fee.state] }}>{t(`myFees.state.${fee.state}`)}</span>
        </div>
      </div>

      {fee.payUrl && primary && (
        <p style={{ ...BODY, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "8px" }}>{t("feePortal.payNote")}</p>
      )}

      {fee.state === "unbillable" && !fee.invoiced && (
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)", marginTop: "8px" }}>{t("feePortal.notInvoiced")}</p>
      )}

      {/* What happens next, and when. Stated before it happens, never after. */}
      {(fee.next || fee.frozen || fee.enforcement === "listing_paused" || fee.enforcement === "account_restricted") && (
        <div style={{ borderTop: "1px solid var(--cr-rule)", marginTop: "16px", paddingTop: "12px" }}>
          <p style={{ ...LABEL, color: "var(--cr-ink-4)", marginBottom: "6px" }}>{t("feePortal.nextTitle")}</p>
          {fee.enforcement === "listing_paused" && (
            <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", marginBottom: "4px" }}>
              {t("feePortal.step.listing_paused")}
            </p>
          )}
          {fee.enforcement === "account_restricted" && (
            <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", marginBottom: "4px" }}>
              {t("feePortal.step.account_restricted")}
            </p>
          )}
          {fee.frozen ? (
            <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", margin: 0 }}>{t("feePortal.frozen")}</p>
          ) : fee.planMonths && !fee.overdueInstalment ? (
            <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", margin: 0 }}>{t("feePortal.onPlan")}</p>
          ) : fee.next ? (
            <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", margin: 0 }}>
              {isPast(fee.next.on)
                ? t("feePortal.nextToday")
                : t(fee.next.step === "account_restricted" ? "feePortal.nextRestrict" : "feePortal.nextPause", { date: day(fee.next.on) })}
            </p>
          ) : null}
          {fee.overdueInstalment && (
            <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "6px" }}>
              {t("feePortal.missedInstalment", { n: fee.overdueInstalment.seq, date: day(fee.overdueInstalment.due) })}
            </p>
          )}
        </div>
      )}

      {fee.state === "disputed" && (
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)", marginTop: "8px" }}>
          {t("myFees.underReview")}{fee.disputeReason ? `: “${fee.disputeReason}”` : ""}
        </p>
      )}
      {fee.resolvedAt && fee.disputeResolution && (
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)", marginTop: "8px" }}>
          {t("myFees.resolved")}: {fee.disputeResolution}
        </p>
      )}

      {/* The second door: the objection to a fee is usually timing, not amount. */}
      <FeePlan dealId={fee.id} state={fee.state} onChanged={onChanged} />

      {/* The third door. A founder who thinks the number is wrong needs a way to
          say so that is not simply not paying. */}
      {canAct && (
        disputing ? (
          <div style={{ marginTop: "12px" }}>
            <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 1000))}
              rows={3} placeholder={t("myFees.disputePlaceholder")}
              style={{
                width: "100%", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
                borderRadius: "4px", ...BODY, fontSize: "13px", color: "var(--cr-ink)",
                padding: "10px 12px", outline: "none", resize: "vertical",
              }} />
            <p style={{ ...BODY, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "8px" }}>{t("feePortal.disputeNote")}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px" }}>
              <button onClick={submitDispute} disabled={busy} style={{ ...BTN_OUTLINE, opacity: busy ? 0.6 : 1 }}>
                {t("myFees.submitDispute")}
              </button>
              <button onClick={() => { setDisputing(false); setReason(""); }} style={{ ...BTN_TEXT, fontWeight: 400, color: "var(--cr-ink-4)" }}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setDisputing(true)} style={{ ...BTN_TEXT, color: "var(--cr-copper)", marginTop: "4px" }}>
            {t("myFees.disputeCta")}
          </button>
        )
      )}
    </div>
  );
}

type Instalment = { seq: number; amount: number; due_date: string; paid_at: string | null };

/**
 * The instalment schedule for one fee, and the offer to start one. The existing
 * /api/fees/plan machinery -- same schedule, same total, no new payment path.
 */
function FeePlan({ dealId, state, onChanged }: { dealId: string; state: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ instalments: Instalment[]; eligible: boolean; minMonths: number; maxMonths: number } | null>(null);
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/fees/plan?dealId=${dealId}`);
    if (res.ok) setData(await res.json());
  }, [dealId]);
  useEffect(() => { void load(); }, [load]);

  async function start() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/fees/plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, months }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(j.error || t("common.error")); return; }
    notify.success(t("feePlan.started"));
    void load();
    onChanged();
  }

  if (!data) return null;

  if (data.instalments.length > 0) {
    const paid = data.instalments.filter(i => i.paid_at).length;
    return (
      <div style={{ marginTop: "16px", borderTop: "1px solid var(--cr-rule)", paddingTop: "12px" }}>
        <p style={{ ...LABEL, color: "var(--cr-ink-4)", marginBottom: "8px" }}>
          {t("feePlan.scheduleTitle", { paid, count: data.instalments.length })}
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data.instalments.map((i, idx) => (
            <li key={i.seq} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
              padding: "8px 0", borderTop: idx > 0 ? "1px solid var(--cr-rule)" : "none",
            }}>
              <span style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)" }}>
                <span style={{ ...MONO, fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", marginRight: "8px" }}>
                  {String(i.seq).padStart(2, "0")}
                </span>
                <span style={{ ...MONO, fontWeight: 400, fontSize: "11px" }}>{day(i.due_date)}</span>
              </span>
              <span style={{ ...MONO, fontWeight: 600, fontSize: "12px", color: i.paid_at ? "var(--verdigris)" : "var(--cr-ink)" }}>
                {(i.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                {i.paid_at ? ` ${t("feePlan.paidMark")}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!data.eligible || state === "collected") return null;

  return (
    <div style={{ marginTop: "16px", borderTop: "1px solid var(--cr-rule)", paddingTop: "12px" }}>
      <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)", marginBottom: "8px" }}>{t("feePlan.offer")}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <select value={months} onChange={e => setMonths(Number(e.target.value))}
          style={{
            minHeight: "40px", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
            borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
            fontSize: "13px", color: "var(--cr-ink)", padding: "0 10px",
          }}>
          {Array.from({ length: data.maxMonths - data.minMonths + 1 }, (_, i) => data.minMonths + i).map(m => (
            <option key={m} value={m}>{t("feePlan.months", { n: m })}</option>
          ))}
        </select>
        <button onClick={start} disabled={busy} style={{ ...BTN_OUTLINE, opacity: busy ? 0.6 : 1 }}>{t("feePlan.start")}</button>
      </div>
      <p style={{ ...BODY, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "8px" }}>{t("feePlan.sameTotal")}</p>
    </div>
  );
}

/**
 * The ladder, written down where a founder can read it before they are on it.
 * A consequence that is only ever explained at the moment it lands reads as a
 * punishment; the same consequence published in advance is a term.
 */
function Ladder({ e }: { e: Enforcement }) {
  const { t } = useTranslation();
  const steps = [
    { day: DUNNING_DAYS[0], text: t("feePortal.ladderStep1") },
    { day: e.pauseDays, text: t("feePortal.ladderStep2") },
    { day: e.restrictDays, text: t("feePortal.ladderStep3") },
  ];
  return (
    <section>
      <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("feePortal.ladderTitle")}</div>
      <div style={CARD}>
        {steps.map((s, i) => (
          <div key={s.day} style={{
            display: "flex", gap: "16px", alignItems: "baseline", padding: "16px 20px",
            borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none",
          }}>
            <span style={{ ...MONO, fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", flexShrink: 0 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", margin: 0 }}>
              <span style={{ ...MONO, fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)" }}>
                {t("feePortal.dayN", { n: s.day })}
              </span>{" "}{s.text}
            </p>
          </div>
        ))}
      </div>
      <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "12px", maxWidth: "60ch" }}>
        {t("feePortal.ladderNote")}
      </p>
    </section>
  );
}
