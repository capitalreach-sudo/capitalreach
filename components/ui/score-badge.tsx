"use client";

import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The AI readiness score, as a number.
 *
 * This was a ring with the figure drawn inside it. The ring rendered; the
 * number did not — the text element counter-rotated the parent SVG's
 * `rotate(-90deg)` with a px translate against a scaled viewBox, which pushed
 * it outside the drawn area. Every card on the browse page has been showing a
 * copper circle with nothing in it.
 *
 * It is a number now, which is what the thing actually is. A 0–100 figure
 * gains nothing from being an arc: the arc is harder to read at 36px, and it
 * was the part that broke.
 */
export function ScoreBadge({ score, locked = false, size = "md" }: {
  score: number | null;
  /** Paid feature on some plans — show that it exists without showing it. */
  locked?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useTranslation();

  const dims = {
    sm: { figure: "13px", label: "8px", gap: 1 },
    md: { figure: "17px", label: "8.5px", gap: 1 },
    lg: { figure: "24px", label: "9px", gap: 2 },
  }[size];

  const wrap: React.CSSProperties = {
    display: "inline-flex", flexDirection: "column", alignItems: "flex-end",
    gap: dims.gap, flexShrink: 0, lineHeight: 1,
  };
  const label: React.CSSProperties = {
    fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: dims.label,
    textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cr-ink-4)",
  };

  if (locked) {
    return (
      <span style={wrap} title={t("startup.scoreLocked")}>
        <Lock style={{ width: 12, height: 12, color: "var(--cr-ink-4)" }} />
        <span style={label}>{t("startup.scoreLabel")}</span>
      </span>
    );
  }

  if (score == null) {
    return (
      <span style={wrap} title={t("startup.scoreNone")}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: dims.figure, color: "var(--cr-ink-4)" }}>—</span>
        <span style={label}>{t("startup.scoreLabel")}</span>
      </span>
    );
  }

  return (
    <span style={wrap} title={t("startup.scoreTitle", { score })}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: dims.figure, color: "var(--cr-copper)" }}>
        {score}
        <span style={{ fontSize: "0.6em", color: "var(--cr-ink-4)", fontWeight: 500 }}>/100</span>
      </span>
      <span style={label}>{t("startup.scoreLabel")}</span>
    </span>
  );
}
