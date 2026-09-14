"use client";

import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The AI consistency score, as a number.
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

  // Figures on the type scale (13/15/22); the caption joins the one caps
  // voice at 11px -- the old 8-9px caps were below the contrast floor.
  const dims = {
    sm: { figure: "13px", label: "11px", gap: 1 },
    md: { figure: "15px", label: "11px", gap: 1 },
    lg: { figure: "22px", label: "11px", gap: 2 },
  }[size];

  const wrap: React.CSSProperties = {
    display: "inline-flex", flexDirection: "column", alignItems: "flex-end",
    gap: dims.gap, flexShrink: 0, lineHeight: 1,
  };
  // The caption names the number in full, which is longer than the figure
  // above it. Capped and right-aligned so it wraps under itself rather than
  // widening a badge the card header cannot shrink, which would eat the space
  // the company name is truncated into.
  const label: React.CSSProperties = {
    fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: dims.label,
    textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-3)",
    maxWidth: "84px", textAlign: "right", lineHeight: 1.25,
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
