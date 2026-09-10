"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import {
  TRUST_LADDER, evidenceByKind, evidenceChecklist, requiredEvidence,
  type EvidenceKind, type SubjectType, type TrustLevel,
} from "@/lib/trust";
import { EvidenceItem, isSatisfied, type EvidenceView } from "@/components/verify/evidence-item";

/**
 * The application itself.
 *
 * One case at a time, one rung at a time. The applicant picks the level they
 * need, works down a checklist built from the ladder, and submits once. There
 * is no progress bar and no confetti: this is a form a reviewer will read, and
 * the honest thing to show is exactly what is still outstanding.
 *
 * Nothing here is trusted by the server. Every button lands on a route that
 * re-proves ownership of the case and of the subject it names, and the page
 * re-reads its state from the server after each change rather than believing
 * its own optimistic copy.
 */

export interface CaseView {
  id: string;
  status: string;
  levelRequested: number;
  levelGranted: number | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const DATA: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
  fontWeight: 500, fontSize: "12px", letterSpacing: "0.02em",
};

const BODY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  lineHeight: 1.65, color: "var(--cr-ink-3)",
};

/** Statuses in which the case is still the applicant's to change. */
const EDITABLE = ["draft", "needs_more"];

export function VerifyFlow({
  subjectType, currentLevel, initialCase, initialEvidence, initialDomainRecord, suggestedDomain,
}: {
  subjectType: SubjectType;
  /** The level the subject stands on today, expiry already applied. */
  currentLevel: TrustLevel;
  initialCase: CaseView | null;
  initialEvidence: EvidenceView[];
  /** Derived from the case id on the server; null until a case exists. */
  initialDomainRecord: { host: string; value: string } | null;
  suggestedDomain: string | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  const [caseRow, setCaseRow] = useState<CaseView | null>(initialCase);
  const [domainRecord, setDomainRecord] = useState(initialDomainRecord);
  const [busy, setBusy] = useState(false);

  const nextRung = Math.min(4, Math.max(1, currentLevel + 1)) as TrustLevel;
  const [level, setLevel] = useState<TrustLevel>(
    (initialCase?.levelRequested as TrustLevel | undefined) ?? nextRung,
  );

  // The server is the source of truth after every mutation. Compare on the
  // fields that matter rather than on object identity, which a re-render
  // changes on its own and would loop.
  const stamp = initialCase
    ? `${initialCase.id}:${initialCase.status}:${initialCase.levelRequested}:${initialCase.updatedAt}`
    : "none";
  useEffect(() => {
    setCaseRow(initialCase);
    setDomainRecord(initialDomainRecord);
    if (initialCase) setLevel(initialCase.levelRequested as TrustLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  const editable = !caseRow || EDITABLE.includes(caseRow.status);
  const checklist = useMemo(() => evidenceChecklist(level, subjectType), [level, subjectType]);

  // The domain proof keeps one row per domain tried, so taking the last row of
  // a kind lets a mistyped second domain hide the one that passed -- and the
  // submit route, which counts any supplied row, would then accept a case this
  // page still shows as outstanding.
  const byKind = useMemo(() => evidenceByKind(initialEvidence), [initialEvidence]);

  const outstanding = checklist.filter((kind) => !isSatisfied(byKind.get(kind)));
  const extras = initialEvidence.filter((row) => !checklist.includes(row.kind as EvidenceKind));

  async function callCase(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/verification/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(json.messageKey ? t(json.messageKey) : json.error || t("errors.generic"));
        return false;
      }
      setCaseRow(json.case);
      setDomainRecord(json.domainRecord ?? null);
      router.refresh();
      return true;
    } catch {
      notify.error(t("errors.generic"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (await callCase({ subjectType, levelRequested: level })) notify.success(t("verify.started"));
  }

  async function submit() {
    if (await callCase({ subjectType, levelRequested: level, action: "submit" })) {
      notify.success(t("verify.submittedToast"));
    }
  }

  async function chooseLevel(next: TrustLevel) {
    setLevel(next);
    if (caseRow && editable) await callCase({ subjectType, levelRequested: next });
  }

  return (
    <section>
      {/* ── The rung being applied for ──────────────────────────────────── */}
      <div className="ruled-label" style={{ marginBottom: "8px" }}>{t("verify.chooseLevel")}</div>
      <p style={{ ...BODY, marginBottom: "16px", maxWidth: "62ch" }}>{t("verify.chooseLevelHint")}</p>

      <div style={{ borderBottom: "1px solid var(--cr-rule)" }}>
        {([1, 2, 3, 4] as TrustLevel[]).map((rung) => {
          const held = rung <= currentLevel;
          const selected = rung === level;
          const checks = requiredEvidence(rung, subjectType).length;
          return (
            <button
              key={rung}
              type="button"
              onClick={() => { if (editable && !held && !busy) void chooseLevel(rung); }}
              disabled={!editable || held || busy}
              aria-pressed={selected}
              style={{
                width: "100%", textAlign: "start", background: selected ? "var(--cr-paper-3)" : "transparent",
                border: "none", borderTop: "1px solid var(--cr-rule)", padding: "12px 12px 12px 0",
                display: "flex", alignItems: "baseline", gap: "12px", minHeight: "48px",
                cursor: editable && !held ? "pointer" : "default",
                opacity: held ? 0.55 : 1,
              }}
            >
              <span aria-hidden style={{
                width: "12px", flexShrink: 0, fontSize: "10px",
                color: "var(--cr-copper)", paddingInlineStart: selected ? "6px" : "6px",
              }}>
                {selected ? "✦" : ""}
              </span>
              <span style={{ ...DATA, width: "22px", flexShrink: 0, color: "var(--cr-ink-4)" }}>
                {String(rung).padStart(2, "0")}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display: "block", fontFamily: "'DM Sans', sans-serif",
                  fontWeight: selected ? 600 : 500, fontSize: "14px", color: "var(--cr-ink)",
                }}>
                  {t(TRUST_LADDER[rung].key)}
                </span>
                <span style={{ ...BODY, display: "block", fontSize: "12px" }}>
                  {t(TRUST_LADDER[rung].meansKey)}
                </span>
              </span>
              <span style={{ ...LABEL, flexShrink: 0, color: held ? "var(--verdigris)" : "var(--cr-ink-4)" }}>
                {held ? t("verify.levelHeld") : t("verify.checksCount", { count: checks })}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── The checklist ───────────────────────────────────────────────── */}
      <div className="ruled-label" style={{ marginTop: "48px", marginBottom: "8px" }}>
        {t("verify.checklist")}
      </div>
      <p style={{ ...BODY, marginBottom: "8px", maxWidth: "62ch" }}>{t("verify.privacy")}</p>

      <div>
        {checklist.map((kind, i) => (
          <EvidenceItem
            key={kind}
            index={i + 1}
            kind={kind}
            evidence={byKind.get(kind) ?? null}
            caseId={caseRow?.id ?? null}
            editable={editable && !!caseRow}
            domainRecord={domainRecord}
            suggestedDomain={suggestedDomain}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      {/* Checks that happened without being asked for. Level 1 does not
          require an email at the domain, but a reviewer should still see it. */}
      {extras.length > 0 && (
        <>
          <div style={{ ...LABEL, borderTop: "1px solid var(--cr-rule)", paddingTop: "16px", marginTop: "0" }}>
            {t("verify.alsoOnFile")}
          </div>
          <div>
            {extras.map((row) => (
              <div key={row.id} style={{
                display: "flex", justifyContent: "space-between", gap: "12px",
                padding: "8px 0", borderTop: "1px solid var(--cr-rule)",
              }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-2)" }}>
                  {t(`trust.ev.${row.kind}`)}
                </span>
                <span style={{ ...LABEL, color: row.status === "passed" ? "var(--verdigris)" : "var(--cr-ink-4)" }}>
                  {t(`verify.ev.${row.status}`)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Where the application stands, and the one action ─────────────── */}
      <div style={{ borderTop: "1px solid var(--cr-rule-dark)", marginTop: "32px", paddingTop: "24px" }}>
        {caseRow && (
          <>
            <div style={{ ...LABEL, marginBottom: "4px" }}>{t("verify.caseStatus")}</div>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px",
              color: "var(--cr-ink)", marginBottom: "6px",
            }}>
              {t(`verify.status.${caseRow.status}`)}
            </p>
          </>
        )}

        {caseRow?.decisionNote && (
          <>
            <div style={{ ...LABEL, marginTop: "12px", marginBottom: "4px" }}>{t("verify.reviewerNote")}</div>
            <p style={{ ...BODY, maxWidth: "62ch" }}>{caseRow.decisionNote}</p>
          </>
        )}

        {!editable && caseRow && (
          <p style={{ ...BODY, maxWidth: "62ch", marginTop: "8px" }}>{t("verify.submittedNote")}</p>
        )}

        {editable && (
          <div style={{ marginTop: "16px" }}>
            {!caseRow ? (
              <button type="button" className="btn-copper" onClick={start} disabled={busy}>
                {busy ? t("verify.saving") : t("verify.start")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-copper"
                  onClick={submit}
                  disabled={busy || outstanding.length > 0}
                  style={{ opacity: busy || outstanding.length > 0 ? 0.5 : 1 }}
                >
                  {busy ? t("verify.saving") : t("verify.submit")}
                </button>
                <p style={{ ...BODY, fontSize: "12px", marginTop: "10px", maxWidth: "62ch" }}>
                  {outstanding.length > 0
                    ? t("verify.submitBlocked", { count: outstanding.length })
                    : t("verify.submitReady")}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
