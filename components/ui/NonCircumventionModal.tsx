"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { SUCCESS_FEE_PERCENT, NON_CIRCUMVENTION_MONTHS } from "@/lib/circumvention-text";

interface Props {
  open: boolean;
  startupId: string;
  startupName: string;
  /** Called after the acknowledgment has been recorded server-side. */
  onConfirmed: (ack: { ackId: string; acknowledgedAt: string }) => void;
  onCancel: () => void;
}

/**
 * Non-circumvention acknowledgment (Phase 1, mechanism B).
 *
 * Shown the first time an investor tries to contact a specific startup. It
 * cannot be dismissed by clicking outside; the only ways out are Cancel and
 * Confirm. Confirm POSTs to /api/circumvention/ack, which stamps IP, user
 * agent and timestamp server-side and is idempotent per (investor, startup).
 */
export function NonCircumventionModal({ open, startupId, startupName, onConfirmed, onCancel }: Props) {
  const { t } = useTranslation();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<string>("");

  useEscapeKey(open && !busy, onCancel);

  useEffect(() => {
    if (!open) return;
    setAgreed(false); setError(null); setBusy(false);
    setNow(new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
  }, [open]);

  if (!open) return null;

  async function confirm() {
    if (!agreed || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/circumvention/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.acknowledged) {
        setError(data.error || t("errors.generic"));
        return;
      }
      onConfirmed({ ackId: data.ackId, acknowledgedAt: data.acknowledgedAt });
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const bullets = [
    t("circumvention.bullet1"),
    t("circumvention.bullet2", { fee: SUCCESS_FEE_PERCENT, months: NON_CIRCUMVENTION_MONTHS }),
    t("circumvention.bullet3"),
    t("circumvention.bullet4"),
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ncm-title"
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,22,18,0.6)", padding: "16px" }}
    >
      <div className="animate-fade-up" style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", width: "100%", maxWidth: "480px", boxShadow: "0 24px 64px rgba(26,22,18,0.25)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "24px 26px 0" }}>
          <div>
            <div className="ruled-label" style={{ marginBottom: "10px" }}>{t("circumvention.eyebrow")}</div>
            <h3 id="ncm-title" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "21px", color: "var(--cr-ink)", lineHeight: 1.2 }}>
              {t("circumvention.title", { name: startupName })}
            </h3>
          </div>
          <button onClick={onCancel} disabled={busy} aria-label={t("common.cancel")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", padding: 4, marginTop: -4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: "18px 26px 0" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13.5px", color: "var(--cr-ink-2)", marginBottom: "12px" }}>
            {t("circumvention.intro")}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "9px" }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-2)", lineHeight: 1.55 }}>
                <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "10px", marginTop: "5px", flexShrink: 0 }}>◆</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginTop: "18px", padding: "12px 14px", background: "var(--cr-paper-3)", border: `1px solid ${agreed ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`, borderRadius: "4px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: "3px", accentColor: "var(--cr-copper)", width: 15, height: 15, flexShrink: 0 }}
            />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", lineHeight: 1.5 }}>
              {t("circumvention.checkbox")}
              <span style={{ display: "block", fontWeight: 300, fontSize: "11.5px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{t("circumvention.checkboxHint")}</span>
            </span>
          </label>

          {error && (
            <p role="alert" style={{ marginTop: "10px", fontFamily: "'DM Sans', sans-serif", fontSize: "12.5px", color: "var(--cr-down)" }}>{error}</p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "18px 26px 22px" }}>
          <div className="flex flex-col-reverse sm:flex-row" style={{ gap: "10px", justifyContent: "flex-end" }}>
            <button onClick={onCancel} disabled={busy}
              style={{ height: "42px", padding: "0 18px", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
              {t("common.cancel")}
            </button>
            <button onClick={confirm} disabled={!agreed || busy} className={agreed ? "btn-copper-shimmer" : undefined}
              style={{ height: "42px", padding: "0 22px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", cursor: !agreed || busy ? "default" : "pointer", opacity: !agreed || busy ? 0.5 : 1 }}>
              {busy ? t("common.saving") : `${t("circumvention.confirm")} →`}
            </button>
          </div>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10.5px", color: "var(--cr-ink-4)", textAlign: "center" }}>
            {t("circumvention.footer", { time: now })}
          </p>
        </div>
      </div>
    </div>
  );
}
