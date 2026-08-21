"use client";

import { useTranslation } from "@/hooks/useTranslation";

/**
 * The honesty chip. Sample listings keep the marketplace from looking dead
 * before real supply arrives — but only as long as they say what they are.
 * One investor who discovers a listing is fictional never comes back.
 */
export function DemoBadge() {
  const { t } = useTranslation();
  return (
    <span title={t("demo.tooltip")} style={{
      display: "inline-flex", alignItems: "center",
      fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 9,
      textTransform: "uppercase", letterSpacing: "0.08em",
      color: "var(--cr-ink-4)", background: "var(--cr-paper-3)",
      border: "1px dashed var(--cr-rule-dark)", borderRadius: 3,
      padding: "2px 6px", flexShrink: 0,
    }}>
      {t("demo.badge")}
    </span>
  );
}
