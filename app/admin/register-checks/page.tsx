"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Navbar } from "@/components/shared/navbar";
import { notify } from "@/components/ui/toast-notify";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { SUCCESS_FEE_PERCENT } from "@/lib/circumvention-text";
import {
  REGISTER_VERDICTS,
  registerDifference,
  supplementaryFeeOn,
  type RegisterVerdict,
} from "@/lib/register-check";

/**
 * The register bench.
 *
 * One row per closed round whose ninety days have run out. The two numbers in
 * front of the reviewer are what the pair declared and what the company told
 * its own national register, and the gap between them is the only thing on
 * this page that is not already a fact.
 *
 * That gap is NOT a finding. A round closing in tranches gets filed as one
 * entry, a filing basis can be share capital rather than money received, a
 * note converts months later at a different number, and a court gets to a
 * German entry when it gets to it. So there is no verdict suggested here, no
 * colour on the difference and no default selected: a reviewer reads both
 * figures and says what they think happened.
 *
 * The fee a discrepancy would raise is shown before anything is committed, so
 * the figure the reviewer approves is the figure that gets billed.
 *
 * Strings are not routed through useTranslation. The admin surface is English
 * only, and the routes behind it return their errors in English, so a
 * half-translated bench would read worse than an untranslated one.
 */

const UI = "'DM Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";

const label: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "10px", letterSpacing: "0.07em",
  textTransform: "uppercase", color: "var(--cr-ink-4)",
};

const body: React.CSSProperties = {
  fontFamily: UI, fontWeight: 300, fontSize: "13px", lineHeight: 1.6,
  color: "var(--cr-ink-3)",
};

const figure: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 600, fontSize: "13px",
  fontVariantNumeric: "tabular-nums", color: "var(--cr-ink)",
};

const dateFigure: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 500, fontSize: "11px",
  fontVariantNumeric: "tabular-nums", color: "var(--cr-ink-4)",
};

const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontFamily: UI, fontWeight: 400,
  fontSize: "13px", color: "var(--cr-ink)", background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "8px 10px",
};

const primaryBtn: React.CSSProperties = {
  fontFamily: UI, fontWeight: 600, fontSize: "13px", color: "var(--cr-paper)",
  background: "var(--cr-copper)", border: "1px solid var(--cr-copper)",
  borderRadius: "999px", padding: "8px 18px", cursor: "pointer", minHeight: "40px",
};

const linkStyle: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "12px",
  color: "var(--cr-copper)", textDecoration: "none",
  display: "inline-flex", alignItems: "center", gap: "5px",
};

interface QueueRow {
  dealId: string;
  declaredAmount: number | null;
  currency: string | null;
  closedAt: string | null;
  dueOn: string | null;
  filedAmount: number | null;
  successFeeAmount: number | null;
  startupId: string | null;
  startupName: string | null;
  startupSlug: string | null;
  legalEntityName: string | null;
  registerType: string | null;
  registerNumber: string | null;
  registerUrl: string | null;
  queryable: boolean;
  investorName: string | null;
}

interface QueueResponse {
  rows: QueueRow[];
  canActOnDiscrepancy: boolean;
  checkDays: number;
  registryConfigured: boolean;
}

const REGISTER_LABELS: Record<string, string> = {
  companies_house: "Companies House",
  handelsregister: "Handelsregister",
  other: "Other register",
};

const VERDICT_LABELS: Record<RegisterVerdict, string> = {
  matched: "Matches the filing",
  discrepancy: "Differs from the filing",
  no_filing_found: "No filing found",
};

interface Draft {
  verdict: RegisterVerdict | "";
  filedAmount: string;
  note: string;
  supplementaryInvoice: boolean;
  strike: "" | "startup" | "investor";
}

const EMPTY_DRAFT: Draft = {
  verdict: "",
  filedAmount: "",
  note: "",
  supplementaryInvoice: false,
  strike: "",
};

export default function AdminRegisterChecksPage() {
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/register-checks", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFailed(data.error || "Could not load the queue.");
        setQueue({ rows: [], canActOnDiscrepancy: false, checkDays: 90, registryConfigured: false });
        return;
      }
      setFailed(null);
      setQueue(data as QueueResponse);
    } catch {
      setFailed("Could not reach the queue.");
      setQueue({ rows: [], canActOnDiscrepancy: false, checkDays: 90, registryConfigured: false });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function open(row: QueueRow) {
    const next = openId === row.dealId ? null : row.dealId;
    setOpenId(next);
    // A figure typed against one round never follows the reviewer to the next.
    setDraft(EMPTY_DRAFT);
  }

  async function record(row: QueueRow) {
    if (!draft.verdict) { notify.error("Say what the register shows."); return; }
    const needsAmount = draft.verdict === "matched" || draft.verdict === "discrepancy";
    const filed = Number(draft.filedAmount);
    if (needsAmount && (!draft.filedAmount.trim() || !Number.isFinite(filed) || filed < 0)) {
      notify.error("Record the amount the register shows.");
      return;
    }
    if (draft.verdict === "discrepancy" && !draft.note.trim()) {
      notify.error("A discrepancy needs a note saying what the difference is.");
      return;
    }

    // The consequences are only offered against a discrepancy with a filed
    // figure above the declared one, and the route refuses the whole check if
    // one arrives without the other. An amount edited after a box was ticked
    // would otherwise lose the verdict along with the fee.
    const difference = needsAmount ? registerDifference(filed, row.declaredAmount) : null;
    const consequential = draft.verdict === "discrepancy";
    const wantsInvoice = consequential && draft.supplementaryInvoice && difference !== null && difference > 0;
    const strike = consequential && draft.strike ? draft.strike : undefined;

    setBusy(row.dealId);
    let res: Response | null = null;
    let data: { error?: string; invoiceError?: string | null; strikeError?: string | null } = {};
    try {
      res = await fetch(`/api/admin/register-checks/${row.dealId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: draft.verdict,
          filedAmount: needsAmount ? filed : undefined,
          note: draft.note.trim() || undefined,
          supplementaryInvoice: wantsInvoice,
          strike,
        }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      data = {};
    } finally {
      setBusy(null);
    }

    if (!res?.ok) { notify.error(data.error || "Could not record the check."); return; }

    // The verdict is written before the fee and the strike are attempted, so a
    // failure in either is reported without pretending the check did not land.
    if (data.invoiceError) notify.error(data.invoiceError);
    if (data.strikeError) notify.error(data.strikeError);
    if (!data.invoiceError && !data.strikeError) notify.success("Check recorded.");

    setOpenId(null);
    setDraft(EMPTY_DRAFT);
    await load();
  }

  const rows = queue?.rows ?? [];
  const canAct = queue?.canActOnDiscrepancy ?? false;

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "80vh" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "100px 24px 64px" }}>
          <div className="ruled-label" style={{ marginBottom: "16px" }}>Register checks</div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700,
            fontSize: "clamp(28px,4vw,44px)", color: "var(--cr-ink)",
            letterSpacing: "-0.02em", marginBottom: "8px",
          }}>
            What the company filed
          </h1>
          <p style={{ ...body, maxWidth: "66ch", marginBottom: "28px" }}>
            Each round below closed more than {queue?.checkDays ?? 90} days ago and has a register
            entity on file. A round is here because a clock expired, not because anything is
            suspected of it. Read both figures, then say what you found. A filing can differ from a
            close for honest reasons, so nothing is decided until you decide it.
          </p>

          {failed && (
            <p style={{ ...body, color: "var(--cr-down)", marginBottom: "16px" }}>{failed}</p>
          )}

          {queue === null && <p style={{ ...label }}>Loading</p>}

          {queue !== null && rows.length === 0 && !failed && (
            <p style={{ ...body }}>Nothing is due.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {rows.map((row) => {
              const isOpen = openId === row.dealId;
              const currency = row.currency ?? "USD";
              const typed = Number(draft.filedAmount);
              const preview =
                isOpen && draft.verdict === "discrepancy" && draft.filedAmount.trim() && Number.isFinite(typed)
                  ? registerDifference(typed, row.declaredAmount)
                  : null;
              const fee = preview !== null && preview > 0 ? supplementaryFeeOn(preview) : 0;

              return (
                <div
                  key={row.dealId}
                  style={{
                    border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
                    background: "var(--cr-paper)", padding: "16px 18px",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", alignItems: "baseline" }}>
                    <span style={{ fontFamily: UI, fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>
                      {row.startupName || "Unnamed company"}
                    </span>
                    {row.investorName && (
                      <span style={{ ...body, fontSize: "12px" }}>with {row.investorName}</span>
                    )}
                  </div>

                  <div style={{ marginTop: "12px", borderTop: "1px solid var(--cr-rule)" }}>
                    <Fact name="Legal entity">
                      <span style={{ ...body, fontSize: "13px", color: "var(--cr-ink)" }}>
                        {row.legalEntityName || "Not recorded"}
                      </span>
                    </Fact>
                    <Fact name="Register">
                      <span style={{ ...body, fontSize: "13px", color: "var(--cr-ink)" }}>
                        {REGISTER_LABELS[row.registerType ?? ""] || row.registerType || "Not recorded"}
                      </span>
                      {row.registerNumber && (
                        <span style={{ ...dateFigure, marginInlineStart: "10px", color: "var(--cr-ink)" }}>
                          {row.registerNumber}
                        </span>
                      )}
                    </Fact>
                    <Fact name="Declared at close">
                      <span style={figure}>
                        {row.declaredAmount === null ? "Not recorded" : formatMoney(row.declaredAmount, currency)}
                      </span>
                    </Fact>
                    <Fact name="Closed">
                      <span style={dateFigure}>{row.closedAt ? formatDate(row.closedAt) : "Not recorded"}</span>
                      {row.dueOn && (
                        <span style={{ ...dateFigure, marginInlineStart: "10px" }}>due {formatDate(row.dueOn)}</span>
                      )}
                    </Fact>
                    <Fact name="Lookup">
                      <RegisterLookup row={row} />
                    </Fact>
                    {row.filedAmount !== null && (
                      <Fact name="Filed, previously recorded">
                        <span style={figure}>{formatMoney(row.filedAmount, currency)}</span>
                      </Fact>
                    )}
                  </div>

                  <div style={{ marginTop: "14px" }}>
                    <button onClick={() => open(row)} style={{
                      fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)",
                      background: "none", border: "none", padding: "8px 0", cursor: "pointer",
                      textDecoration: "underline", textUnderlineOffset: "3px",
                    }}>
                      {isOpen ? "Close" : "Record what the register says"}
                    </button>
                  </div>

                  {isOpen && (
                    <div style={{
                      marginTop: "8px", borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "16px",
                      display: "flex", flexDirection: "column", gap: "14px",
                    }}>
                      <div>
                        <span style={{ ...label, display: "block", marginBottom: "6px" }}>What the register shows</span>
                        <div style={{ display: "grid", gap: "6px" }}>
                          {REGISTER_VERDICTS.map((v) => (
                            <label key={v} style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: UI, fontSize: "13px", color: "var(--cr-ink)", cursor: "pointer" }}>
                              <input
                                type="radio"
                                name={`verdict-${row.dealId}`}
                                checked={draft.verdict === v}
                                onChange={() => setDraft((d) => ({ ...d, verdict: v }))}
                              />
                              {VERDICT_LABELS[v]}
                            </label>
                          ))}
                        </div>
                      </div>

                      {(draft.verdict === "matched" || draft.verdict === "discrepancy") && (
                        <div>
                          <label htmlFor={`filed-${row.dealId}`} style={{ ...label, display: "block", marginBottom: "6px" }}>
                            Amount on the filing ({currency})
                          </label>
                          <input
                            id={`filed-${row.dealId}`}
                            value={draft.filedAmount}
                            onChange={(e) => setDraft((d) => ({ ...d, filedAmount: e.target.value }))}
                            inputMode="decimal"
                            style={input}
                          />
                        </div>
                      )}

                      {/* The fee is shown before anything is committed: the
                          figure approved here is the figure that gets billed. */}
                      {preview !== null && (
                        <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "12px 14px", background: "var(--cr-paper-2)" }}>
                          <span style={{ ...label, display: "block", marginBottom: "6px" }}>The difference</span>
                          <p style={{ ...body, fontSize: "13px", margin: 0, color: "var(--cr-ink)" }}>
                            Filed {formatMoney(typed, currency)} against{" "}
                            {row.declaredAmount === null ? "nothing declared" : formatMoney(row.declaredAmount, currency)}
                            {preview > 0
                              ? `, ${formatMoney(preview, currency)} more than they told us.`
                              : preview < 0
                                ? `, ${formatMoney(Math.abs(preview), currency)} less than they told us.`
                                : ", the same figure."}
                          </p>
                          {preview > 0 && (
                            <p style={{ ...body, fontSize: "13px", margin: "8px 0 0", color: "var(--cr-ink)" }}>
                              A supplementary fee on that difference comes to{" "}
                              <span style={figure}>{formatMoney(fee, currency)}</span>{" "}
                              at {SUCCESS_FEE_PERCENT}%. The fee on the declared amount was already
                              raised at close.
                            </p>
                          )}
                        </div>
                      )}

                      <div>
                        <label htmlFor={`note-${row.dealId}`} style={{ ...label, display: "block", marginBottom: "6px" }}>
                          Note {draft.verdict === "discrepancy" ? "(required)" : "(optional)"}
                        </label>
                        <textarea
                          id={`note-${row.dealId}`}
                          value={draft.note}
                          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value.slice(0, 1000) }))}
                          rows={3}
                          placeholder="What the filing says, and why it differs if it does."
                          style={{ ...input, resize: "vertical" }}
                        />
                      </div>

                      {draft.verdict === "discrepancy" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          <span style={label}>Consequences, each chosen separately</span>
                          {!canAct && (
                            <p style={{ ...body, fontSize: "12px", margin: 0 }}>
                              Raising a fee or marking a record needs an owner-level admin. The check
                              itself still records.
                            </p>
                          )}
                          <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontFamily: UI, fontSize: "13px", color: canAct ? "var(--cr-ink)" : "var(--cr-ink-4)", cursor: canAct ? "pointer" : "default" }}>
                            <input
                              type="checkbox"
                              disabled={!canAct || !(preview !== null && preview > 0)}
                              checked={draft.supplementaryInvoice}
                              onChange={(e) => setDraft((d) => ({ ...d, supplementaryInvoice: e.target.checked }))}
                            />
                            <span>
                              Raise a supplementary fee on the difference
                              {preview !== null && preview > 0 ? ` (${formatMoney(fee, currency)})` : ""}
                            </span>
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: UI, fontSize: "13px", color: canAct ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>
                            <span>Mark a record</span>
                            <select
                              disabled={!canAct}
                              value={draft.strike}
                              onChange={(e) => setDraft((d) => ({ ...d, strike: e.target.value as Draft["strike"] }))}
                              style={{ ...input, width: "auto" }}
                            >
                              <option value="">Nobody</option>
                              <option value="startup">The company</option>
                              <option value="investor">The investor</option>
                            </select>
                          </label>
                        </div>
                      )}

                      <div>
                        <button
                          onClick={() => void record(row)}
                          disabled={busy === row.dealId}
                          style={{ ...primaryBtn, opacity: busy === row.dealId ? 0.45 : 1 }}
                        >
                          {busy === row.dealId ? "Recording" : "Record the check"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * Whether anything can be looked up, said plainly.
 *
 * Handelsregister has no public API and no stable per-company link: the portal
 * is session-based, so the number has to be pasted into its search by a person.
 * The row must say that rather than offer a link that looks like a lookup and
 * lands on a search box, because a reviewer who believes a lookup ran will
 * record "no filing found" without having read anything.
 */
function RegisterLookup({ row }: { row: QueueRow }) {
  if (!row.registerNumber) {
    return <span style={{ ...body, fontSize: "13px" }}>No register number on file. Nothing to look up.</span>;
  }
  if (!row.registerUrl) {
    return <span style={{ ...body, fontSize: "13px" }}>No link for this register. Find the filing yourself.</span>;
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
      <a href={row.registerUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {row.queryable ? "Open the company record" : "Open the register search"}
        <ExternalLink style={{ width: 11, height: 11 }} aria-hidden />
      </a>
      {!row.queryable && (
        <span style={{ ...body, fontSize: "12px" }}>
          This register answers nobody automatically. Paste {row.registerNumber} into the search and
          read the filing yourself.
        </span>
      )}
    </span>
  );
}

/** One labelled fact on a hairline rule. Inside a card, structure is rules. */
function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]"
      style={{ gap: "2px 16px", padding: "8px 0", borderBottom: "1px solid var(--cr-rule)", alignItems: "baseline" }}
    >
      <span style={label}>{name}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}
