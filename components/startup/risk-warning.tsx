"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The retail risk strip. Aimed-at-smaller-investors positioning means the
 * audience includes people writing their FIRST cheque, and platforms serving
 * them owe the plain sentence every regulator eventually mandates anyway:
 * you can lose everything, it is illiquid, nothing here is advice. Always
 * visible on the listing, not tucked behind a link.
 */
export function RiskWarning() {
  const { t } = useTranslation();
  return (
    <div role="note" style={{
      display: "flex", gap: 8, alignItems: "flex-start",
      background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
      borderLeft: "3px solid var(--cr-copper)", borderRadius: 4,
      padding: "12px 16px", marginTop: 16,
    }}>
      <AlertTriangle style={{ width: 14, height: 14, color: "var(--cr-copper)", flexShrink: 0, marginTop: 1 }} />
      {/* 12px: the small-print step of the type scale (11.5 was off-scale). */}
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 12, color: "var(--cr-ink-3)", lineHeight: 1.55, margin: 0 }}>
        <strong style={{ fontWeight: 600, color: "var(--cr-ink-2)" }}>{t("risk.title")}</strong>{" "}
        {t("risk.body")}
      </p>
    </div>
  );
}
