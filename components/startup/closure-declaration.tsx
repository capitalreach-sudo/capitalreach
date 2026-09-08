"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocale } from "@/components/providers/locale-provider";
import { notify } from "@/components/ui/toast-notify";
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney, type CurrencyCode } from "@/lib/currency";
import { NON_CIRCUMVENTION_MONTHS, SUCCESS_FEE_PERCENT } from "@/lib/circumvention-text";

/**
 * The closure declaration.
 *
 * Every other surface in this layer records what happened on the way IN -- an
 * introduction, an acknowledgment, an NDA, a log of what was handed over. This
 * one asks the only question a fee turns on: how did the round end, and who
 * took part.
 *
 * It is built to be signed, not dismissed. The investors we introduced are on
 * screen by name, with the date we first put the two parties together and what
 * that investor actually received, because a founder who ticks nobody after
 * reading six names has made a statement -- and a statement is the only thing a
 * claim, or a decision not to make one, can rest on. A dialog with a single
 * "confirm" button produces nothing of the kind.
 *
 * Two things it deliberately does NOT do. It never accuses: the copy says what
 * the record holds and what the terms say, and the footnote states plainly that
 * filing does not raise an invoice, because a person does that. And it never
 * shows a route around the platform -- no contact details for anybody listed,
 * on a screen that exists precisely because somebody may have gone around us.
 *
 * The DB outcome is derived rather than asked twice: ticking a name IS the
 * statement that the round closed with an investor introduced here, so the form
 * asks whether capital came in and lets the ticks classify it. Asking both
 * invites a founder to file two contradictory sentences on one dated record.
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

/** Card internals stay on the scale at both ends: 16 on a 375px screen, 24 on
 *  a desktop column. Inline styles cannot carry a media query, and this is a
 *  document -- it wants air where there is room for it. */
const PAD = "clamp(16px, 4vw, 24px)";

// ── The shape /api/startups/round-closure returns ───────────────────────────

interface IntroducedInvestor {
  investorId: string;
  slug: string | null;
  name: string | null;
  firm: string | null;
  type: string | null;
  firstContactAt: string;
  channel: string;
  tailEndsAt: string;
  ndaSigned: boolean;
  ndaSignedAt: string | null;
  disclosures: number;
}

interface ClosureRow {
  id: string;
  outcome: string;
  declaredInvestorIds: string[];
  declaredExternal: string | null;
  amountRaised: number | null;
  currency: string | null;
  introducedInTail: string[];
  undeclaredCount: number;
  attestationVersion: string | null;
  declaredAt: string;
}

interface Payload {
  startup: { id: string; name: string; roundState: string | null };
  terms: { version: string; months: number };
  introduced: IntroducedInvestor[];
  names: Record<string, string>;
  declaredForThisRound: boolean;
  closures: ClosureRow[];
}

/** The vocabularies the migration's CHECK constraints allow, as explicit sets,
 *  so a value we do not have a phrase for renders as itself. */
const CHANNELS = new Set([
  "message", "deal", "nda", "interest", "data_room", "introduction_request",
]);
const OUTCOMES = new Set([
  "closed_with_platform_investor", "closed_other_investors", "closed_no_raise", "withdrawn",
]);

function humanise(slug: string): string {
  return slug.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** What the founder is being asked. "raised" is a UI choice, not a column: the
 *  ticks below it decide which of the two closed outcomes gets written. */
type Choice = "raised" | "closed_no_raise" | "withdrawn";
const CHOICES: Choice[] = ["raised", "closed_no_raise", "withdrawn"];

// ── Small parts ─────────────────────────────────────────────────────────────

/** A section opener. Ordered content carries a mono rail number in the accent
 *  colour; no heading on this page is naked. */
function Opener({ n, children }: { n?: string; children: React.ReactNode }) {
  return (
    <div className="ruled-label" style={{ marginBottom: "12px" }}>
      {n && (
        <span aria-hidden style={{ ...DATA, fontSize: "11px", fontWeight: 600, color: "var(--cr-copper)" }}>{n}</span>
      )}
      <span>{children}</span>
    </div>
  );
}

/** Label left, value right, split by a hairline. The record's only structure. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      ...RULE, padding: "8px 0", display: "flex", alignItems: "baseline",
      justifyContent: "space-between", gap: "16px",
    }}>
      <span style={{ ...LABEL, flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{children}</span>
    </div>
  );
}

export function ClosureDeclaration({ onFiled }: { onFiled?: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();

  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  const [choice, setChoice] = useState<Choice | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [external, setExternal] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/startups/round-closure");
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Payload);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const day = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  };

  const stamp = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(locale, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  const months = data?.terms.months ?? NON_CIRCUMVENTION_MONTHS;
  const raised = choice === "raised";
  // Ticks stay live until the founder says nothing was raised. Gating them on
  // an outcome being chosen first would leave the list dead under a line
  // asking the reader to tick it, and the order these two answers are given in
  // does not change either one.
  const ticksLive = choice !== "closed_no_raise" && choice !== "withdrawn";

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** Changing to an outcome that raised nothing clears the ticks: "nobody took
   *  part" and "these three took part" cannot both be true on one statement,
   *  and leaving a stale tick behind would let the second be filed silently. */
  function chooseOutcome(next: Choice) {
    setChoice(next);
    if (next !== "raised") { setTicked(new Set()); setAmount(""); }
  }

  async function submit() {
    if (busy || !data) return;
    if (!choice) { notify.error(t("closureDecl.needsOutcome")); return; }
    if (!attested) { notify.error(t("closureDecl.needsAttest")); return; }

    // Derived, never asked twice: naming an investor we introduced IS the
    // statement that the round closed with one.
    const outcome = choice === "raised"
      ? (ticked.size > 0 ? "closed_with_platform_investor" : "closed_other_investors")
      : choice;

    setBusy(true);
    try {
      const res = await fetch("/api/startups/round-closure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          declaredInvestorIds: Array.from(ticked),
          declaredExternal: external.trim() || null,
          amountRaised: raised && amount ? Number(amount) : null,
          currency: raised && amount ? currency : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { notify.error(j.error || t("closureDecl.failed")); return; }
      notify.success(t("closureDecl.filed"));
      onFiled?.();
      // Re-read rather than patching local state: what stands as the record is
      // the row the server wrote, including the cross-check it ran itself.
      await load();
    } catch {
      notify.error(t("closureDecl.failed"));
    } finally {
      setBusy(false);
    }
  }

  // ── States before the form ────────────────────────────────────────────────

  if (failed) {
    return <p style={{ ...BODY, color: "var(--cr-ink-4)" }}>{t("closureDecl.error")}</p>;
  }
  if (!data) {
    return <p style={{ ...DATA, color: "var(--cr-ink-4)" }}>{t("closureDecl.loading")}</p>;
  }

  const outcomeLabel = (v: string): string =>
    OUTCOMES.has(v) ? t(`closureDecl.recorded.${v}`) : humanise(v);

  // ── Already declared: show the record, do not ask twice ───────────────────

  if (data.declaredForThisRound && data.closures.length > 0) {
    const [latest, ...earlier] = data.closures;
    const named = latest.declaredInvestorIds
      .map((id) => data.names[id]?.trim() || t("closureDecl.unnamed"));

    return (
      <div>
        <Opener>{t("closureDecl.eyebrow")}</Opener>
        <h2 style={{
          fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "clamp(22px, 3vw, 28px)",
          lineHeight: 1.15, color: "var(--cr-ink)", margin: "0 0 8px",
        }}>
          {t("closureDecl.recordTitle")}
        </h2>
        <p style={{ ...BODY, marginBottom: "24px" }}>
          {t("closureDecl.recordLead", { date: stamp(latest.declaredAt) })}
        </p>

        <section style={{
          background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
          borderRadius: "4px", boxShadow: "var(--cr-card-shadow)", padding: PAD,
        }}>
          <Fact label={t("closureDecl.recordOutcome")}>
            <span style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)" }}>{outcomeLabel(latest.outcome)}</span>
          </Fact>
          <Fact label={t("closureDecl.recordNamed")}>
            <span style={{ ...BODY, fontSize: "13px", color: named.length ? "var(--cr-ink-2)" : "var(--cr-ink-4)" }}>
              {named.length ? named.join(", ") : t("closureDecl.recordNone")}
            </span>
          </Fact>
          {latest.declaredExternal && (
            <Fact label={t("closureDecl.recordExternal")}>
              <span style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", whiteSpace: "pre-wrap" }}>
                {latest.declaredExternal}
              </span>
            </Fact>
          )}
          {latest.amountRaised !== null && (
            <Fact label={t("closureDecl.recordAmount")}>
              <span style={{ ...DATA, fontWeight: 700, fontSize: "14px", color: "var(--cr-ink)" }}>
                {formatMoney(latest.amountRaised, latest.currency)}
              </span>
            </Fact>
          )}
          <Fact label={t("closureDecl.recordIntroduced")}>
            <span style={DATA}>{String(latest.introducedInTail.length).padStart(2, "0")}</span>
          </Fact>
          <Fact label={t("closureDecl.recordDated")}>
            <span style={{ ...DATA, color: "var(--verdigris)" }}>{stamp(latest.declaredAt)}</span>
          </Fact>
          <Fact label={t("closureDecl.recordVersion")}>
            <span style={DATA}>{latest.attestationVersion ?? "—"}</span>
          </Fact>
        </section>

        {earlier.length > 0 && (
          <div style={{ marginTop: "32px" }}>
            <div className="ruled-label" style={{ marginBottom: "12px" }}>
              <span>{t("closureDecl.pastTitle")}</span>
              <span style={{ ...DATA, fontSize: "11px", fontWeight: 600, color: "var(--cr-copper)" }}>
                {String(earlier.length).padStart(2, "0")}
              </span>
            </div>
            {earlier.map((c) => (
              <div key={c.id} style={{
                ...RULE, padding: "12px 0", display: "flex", alignItems: "baseline",
                justifyContent: "space-between", gap: "16px", flexWrap: "wrap",
              }}>
                <span style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", minWidth: 0 }}>
                  {outcomeLabel(c.outcome)}
                  {c.amountRaised !== null && (
                    <span style={{ ...DATA, marginLeft: "8px" }}>{formatMoney(c.amountRaised, c.currency)}</span>
                  )}
                </span>
                <span style={{ ...DATA, color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>{day(c.declaredAt)}</span>
              </div>
            ))}
          </div>
        )}

        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", ...RULE, marginTop: "32px", paddingTop: "16px" }}>
          {t("closureDecl.footnote")}
        </p>
      </div>
    );
  }

  // ── The form ──────────────────────────────────────────────────────────────

  const amountNumber = amount ? Number(amount) : NaN;
  const canFile = !!choice && attested && !busy;

  return (
    <div>
      <Opener n="✦">{t("closureDecl.eyebrow")}</Opener>
      <h2 style={{
        fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "clamp(22px, 3vw, 28px)",
        lineHeight: 1.15, color: "var(--cr-ink)", margin: "0 0 8px",
      }}>
        {t("closureDecl.title", { company: data.startup.name })}
      </h2>
      <p style={{ ...BODY, maxWidth: "62ch", marginBottom: "24px" }}>{t("closureDecl.lead")}</p>

      {/* The three figures that decide what this document means, in mono,
          before any prose asks the reader to take them on trust. */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "24px", ...RULE,
        borderBottom: "1px solid var(--cr-rule)", padding: "12px 0", marginBottom: "32px",
      }}>
        <div>
          <div style={LABEL}>{t("closureDecl.factTerm")}</div>
          <div style={{ ...DATA, fontSize: "14px", fontWeight: 700, color: "var(--cr-ink)", marginTop: "4px" }}>
            {t("closureDecl.factMonths", { months })}
          </div>
        </div>
        <div>
          <div style={LABEL}>{t("closureDecl.factFee")}</div>
          <div style={{ ...DATA, fontSize: "14px", fontWeight: 700, color: "var(--cr-copper)", marginTop: "4px" }}>
            {SUCCESS_FEE_PERCENT}%
          </div>
        </div>
        <div>
          <div style={LABEL}>{t("closureDecl.factDated")}</div>
          <div style={{ ...DATA, fontSize: "14px", fontWeight: 700, color: "var(--cr-ink)", marginTop: "4px" }}>
            {day(new Date().toISOString())}
          </div>
        </div>
      </div>

      {/* 01 -- how it ended */}
      <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
        <legend style={{ padding: 0, marginBottom: "12px" }}>
          <span className="ruled-label">
            <span aria-hidden style={{ ...DATA, fontSize: "11px", fontWeight: 600, color: "var(--cr-copper)" }}>01</span>
            <span>{t("closureDecl.outcomeQuestion")}</span>
          </span>
        </legend>
        <div style={{ marginBottom: "32px" }}>
          {CHOICES.map((c) => (
            <label key={c} style={{
              ...RULE, display: "flex", alignItems: "flex-start", gap: "12px",
              padding: "12px 0", cursor: "pointer",
            }}>
              <input
                type="radio"
                name="closure-outcome"
                checked={choice === c}
                onChange={() => chooseOutcome(c)}
                style={{ width: "16px", height: "16px", marginTop: "2px", accentColor: "var(--cr-copper)", flexShrink: 0 }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ ...TITLE, display: "block", color: choice === c ? "var(--cr-ink)" : "var(--cr-ink-2)" }}>
                  {t(`closureDecl.outcome.${c}`)}
                </span>
                <span style={{ ...BODY, fontSize: "12px", display: "block", marginTop: "2px" }}>
                  {t(`closureDecl.outcomeHint.${c}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 02 -- the names, which is the whole reason this screen exists */}
      <Opener n="02">{t("closureDecl.introducedTitle")}</Opener>
      <p style={{ ...BODY, maxWidth: "62ch", marginBottom: "4px" }}>
        {ticksLive ? t("closureDecl.introducedQuestion") : t("closureDecl.introducedMoot")}
      </p>

      {data.introduced.length === 0 ? (
        <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", ...RULE, paddingTop: "12px", marginTop: "8px", marginBottom: "32px" }}>
          {t("closureDecl.introducedNone", { months })}
        </p>
      ) : (
        <div style={{ marginTop: "8px", marginBottom: "32px" }}>
          {data.introduced.map((inv, idx) => {
            const on = ticked.has(inv.investorId);
            const name = inv.name?.trim() || t("closureDecl.unnamed");
            return (
              <label key={inv.investorId} style={{
                ...RULE, display: "flex", alignItems: "flex-start", gap: "12px",
                padding: "12px 0", cursor: ticksLive ? "pointer" : "default",
              }}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!ticksLive}
                  onChange={() => toggle(inv.investorId)}
                  aria-label={t("closureDecl.tookPart", { name })}
                  style={{ width: "16px", height: "16px", marginTop: "3px", accentColor: "var(--cr-copper)", flexShrink: 0 }}
                />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0 }}>
                      <span aria-hidden style={{ ...DATA, fontSize: "11px", fontWeight: 600, color: "var(--cr-copper)", flexShrink: 0 }}>
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span style={{ ...TITLE, overflowWrap: "anywhere" }}>{name}</span>
                    </span>
                    <span style={{
                      ...BADGE,
                      color: inv.ndaSigned ? "var(--verdigris)" : "var(--cr-ink-4)",
                      borderColor: inv.ndaSigned
                        ? "color-mix(in srgb, var(--verdigris) 35%, transparent)"
                        : "var(--cr-rule-dark)",
                    }}>
                      {inv.ndaSigned ? t("closureDecl.ndaSigned") : t("closureDecl.noNda")}
                    </span>
                  </span>

                  {inv.firm && (
                    <span style={{ ...BODY, fontSize: "12px", display: "block", marginTop: "2px" }}>{inv.firm}</span>
                  )}

                  {/* What we actually did for this pair: when we put them
                      together, through what, and how much they were given. */}
                  <span style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: "6px" }}>
                    <span style={LABEL}>
                      {t("discLog.firstContact")}{" "}
                      <span style={{ ...DATA, fontSize: "11px" }}>{day(inv.firstContactAt)}</span>
                    </span>
                    <span style={LABEL}>
                      {t("discLog.channelLabel")}{" "}
                      <span style={{ ...BODY, fontSize: "11px", color: "var(--cr-ink-2)" }}>
                        {CHANNELS.has(inv.channel) ? t(`discLog.channel.${inv.channel}`) : humanise(inv.channel)}
                      </span>
                    </span>
                    <span style={LABEL}>
                      {t("closureDecl.received")}{" "}
                      <span style={{ ...DATA, fontSize: "11px", color: inv.disclosures > 0 ? "var(--cr-ink-2)" : "var(--cr-ink-4)" }}>
                        {inv.disclosures > 0 ? t("closureDecl.itemCount", { count: inv.disclosures }) : t("closureDecl.receivedNothing")}
                      </span>
                    </span>
                    <span style={LABEL}>
                      {t("discLog.tailEnds")}{" "}
                      <span style={{ ...DATA, fontSize: "11px", color: "var(--verdigris)" }}>{day(inv.tailEndsAt)}</span>
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* 03 -- everyone we never knew about */}
      {raised && (
        <>
          <Opener n="03">{t("closureDecl.externalTitle")}</Opener>
          <p style={{ ...BODY, maxWidth: "62ch", marginBottom: "12px" }}>{t("closureDecl.externalHint")}</p>
          <textarea
            value={external}
            onChange={(e) => setExternal(e.target.value.slice(0, 2000))}
            placeholder={t("closureDecl.externalPlaceholder")}
            rows={4}
            style={{
              ...FIELD,
              fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: 400,
              lineHeight: 1.6, resize: "vertical", marginBottom: "32px",
            }}
          />

          {/* 04 -- the figure */}
          <Opener n="04">{t("closureDecl.amountTitle")}</Opener>
          <p style={{ ...BODY, maxWidth: "62ch", marginBottom: "12px" }}>{t("closureDecl.amountHint")}</p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "8px" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <label htmlFor="closure-amount" style={{ ...LABEL, display: "block", marginBottom: "4px" }}>
                {t("closureDecl.amountLabel")}
              </label>
              <input
                id="closure-amount"
                type="text"
                inputMode="numeric"
                value={amount}
                // Digits only: the column is a whole-unit integer, and a stray
                // separator typed here must not become a different number.
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="0"
                style={FIELD}
              />
            </div>
            <div style={{ flex: "0 1 140px", minWidth: 0 }}>
              <label htmlFor="closure-currency" style={{ ...LABEL, display: "block", marginBottom: "4px" }}>
                {t("closureDecl.currencyLabel")}
              </label>
              <select
                id="closure-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                style={{ ...FIELD, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", cursor: "pointer" }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ ...DATA, color: "var(--cr-ink-4)", marginBottom: "32px", minHeight: "18px" }}>
            {Number.isFinite(amountNumber) && amountNumber > 0 ? formatMoney(amountNumber, currency) : ""}
          </p>
        </>
      )}

      {/* The signature block. Copper hairlines top and bottom, no box: this is
          the moment of the page, and a nested card would make it a panel. */}
      <div style={{
        background: "var(--cr-paper-2)",
        borderTop: "1px solid var(--cr-copper-br)",
        borderBottom: "1px solid var(--cr-copper-br)",
        padding: `${PAD} 0`,
        marginTop: "8px",
      }}>
        <div style={{ padding: `0 ${PAD}` }}>
          {/* The one decorative glyph the house allows, spent on the one
              moment on this page that is a signature. */}
          <div className="ruled-label" style={{ marginBottom: "12px" }}>
            <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "11px", lineHeight: 1 }}>✦</span>
            <span>{t("closureDecl.attestTitle")}</span>
          </div>

          <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-2)", maxWidth: "64ch" }}>
            {t("closureDecl.attestBody", { months, fee: SUCCESS_FEE_PERCENT, company: data.startup.name })}
          </p>

          <label style={{
            display: "flex", alignItems: "flex-start", gap: "12px",
            marginTop: "16px", cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              style={{ width: "16px", height: "16px", marginTop: "2px", accentColor: "var(--cr-copper)", flexShrink: 0 }}
            />
            <span style={{ ...TITLE, fontSize: "14px" }}>{t("closureDecl.attestCheckbox")}</span>
          </label>

          {/* One primary action, and nothing beside it. There is no "not now":
              the founder can leave the page, but the page will not offer to
              help them do it. */}
          <button
            type="button"
            onClick={submit}
            disabled={!canFile}
            style={{
              marginTop: "24px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
              // band-ink, not paper: paper is dark in the dark registers, and a
              // primary action that vanishes into its own fill is not one.
              color: "var(--cr-band-ink)",
              background: "var(--cr-copper)",
              // Dimmed whole, not recoloured: fading the fill alone would drag
              // the label's contrast down with it in the light registers.
              opacity: canFile ? 1 : 0.45,
              border: "none", borderRadius: "999px", padding: "12px 24px",
              cursor: canFile ? "pointer" : "default",
              minHeight: "40px",
            }}
          >
            {busy ? t("closureDecl.submitting") : t("closureDecl.submit")}
          </button>

          <p style={{ ...LABEL, marginTop: "12px" }}>
            {t("closureDecl.stampNote", { version: data.terms.version })}
          </p>
        </div>
      </div>

      <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "16px", maxWidth: "62ch" }}>
        {t("closureDecl.footnote")}
      </p>
    </div>
  );
}
