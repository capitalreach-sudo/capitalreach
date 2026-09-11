"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";

const REASONS = ["misleading", "impersonation", "spam", "not_raising", "abuse", "other"] as const;

/** A claim about a PARTY goes to the incident bench, which takes a report from
 *  a visitor with no session -- the person who can say "those are not their
 *  founders" is very often a competitor or an ex-employee with no account. A
 *  claim about a piece of CONTENT stays on the moderation queue, which keys its
 *  one-open-report-per-person rule on a reporter and so needs one. */
const PARTY_TARGETS = ["startup", "investor"] as const;

/**
 * E50: report this.
 *
 * Deliberately quiet — a small flag, not a button competing with the ones
 * that matter. What it must do is close the loop: the reporter is told their
 * report landed, and told again when it is resolved. A report that vanishes
 * teaches people not to file the next one.
 */
export function ReportButton({ targetType, targetId, label }: {
  targetType: "startup" | "investor" | "message" | "question" | "update";
  targetId: string;
  label?: string;
}) {
  const isParty = (PARTY_TARGETS as readonly string[]).includes(targetType);
  const { t } = useTranslation();
  // t() returns the key itself where a locale has not got the line yet, so a
  // line the copy has not reached is absent rather than rendered as a dotted
  // key on a public page.
  const anonNote = isParty && t("report.anonNote") !== "report.anonNote" ? t("report.anonNote") : null;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("misleading");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  useEscapeKey(open, () => setOpen(false));

  async function submit() {
    if (busy) return;
    setBusy(true);
    let res: Response | null = null;
    let j: { error?: string } = {};
    try {
      res = await fetch(isParty ? "/api/reports" : "/api/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isParty
            ? { subjectType: targetType, subjectId: targetId, reason, detail }
            : { targetType, targetId, reason, detail },
        ),
      });
      j = await res.json().catch(() => ({}));
    } catch {
      j = {};
    } finally {
      setBusy(false);
    }
    if (!res?.ok) { notify.error(j.error || t("errors.generic")); return; }
    setOpen(false); setDetail("");
    notify.success(t("report.thanks"));
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>
        <Flag style={{ width: 11, height: 11 }} /> {label ?? t("report.cta")}
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: 8, padding: 20, width: "100%", maxWidth: 420 }}>
            <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: 4 }}>{t("report.title")}</h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: anonNote ? 6 : 14 }}>{t("report.intro")}</p>
            {anonNote && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: 14 }}>{anonNote}</p>
            )}

            <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              {REASONS.map(r => (
                <label key={r} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)", cursor: "pointer" }}>
                  <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                  {t(`report.reason.${r}`)}
                </label>
              ))}
            </div>

            <textarea value={detail} onChange={e => setDetail(e.target.value.slice(0, 2000))} rows={3}
              placeholder={t("report.detailPh")}
              style={{ width: "100%", boxSizing: "border-box", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: 4, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)", padding: "7px 9px", outline: "none" }} />

            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button onClick={() => setOpen(false)}
                style={{ background: "none", border: "1px solid var(--cr-rule)", borderRadius: 4, padding: "6px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
                {t("common.cancel")}
              </button>
              <button onClick={submit} disabled={busy}
                style={{ background: "var(--cr-ink)", border: "none", borderRadius: 4, padding: "6px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-paper)", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                {t("report.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
