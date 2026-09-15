"use client";

/**
 * A trend in about a thumbnail's worth of space.
 *
 * Extracted from the inline `Sparkline` in `components/startup/startups-search.tsx`
 * (the directory card's MRR trend) so the profile page can draw the same shape
 * from `startup_metrics` without a second implementation. Behaviour is
 * unchanged from the original: a bare polyline, no axis, no labels, caller
 * supplies values already normalised to 0..1. It sits beside a labelled
 * figure (a card's raise strip, a metric cell), so the SVG itself stays
 * `aria-hidden` -- the number next to it is the accessible content.
 *
 * Needs at least 4 points to read as a trend; fewer than that is noise, so it
 * renders nothing rather than a two-point line pretending to be a chart.
 *
 * No CSS transition/animation is added here (static SVG paint, same as its
 * `line-chart`/`donut-chart`/`bar-chart` siblings) so there is nothing for
 * `prefers-reduced-motion` to need to turn off.
 *
 * Hover/focus readout: this used to be a bare, non-interactive shape with
 * nothing behind it for a reader who actually wanted to know what it showed.
 * It is still not a chart -- no scrub, no per-point crosshair, that stays on
 * LineChart -- but hovering or focusing it now surfaces the one fact the
 * line itself cannot spell out in pixels: which way it is headed, and where
 * the last point sits in the range shown. Styled like InfoTip's own small
 * panel so a reader meets the same tooltip voice everywhere on the platform.
 */

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

// Up/down are a two-value scale, not a category, so they live here rather
// than in the categorical `./palette` SERIES -- but as tokens, never a hex
// literal, matching every other chart's rule.
const UP = "var(--cr-up)";
const FLAT_OR_DOWN = "var(--cr-ink-4)";

export function Sparkline({
  values,
  width = 64,
  height = 20,
  strokeWidth = 1.5,
}: {
  /** Pre-normalised 0..1 by the caller (min-max scaled over the series). */
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  const { t } = useTranslation();
  // Renders the fallback until the key lands in every locale (see data-centre.tsx).
  const tf = (key: string, fallback: string) => { const out = t(key); return out === key ? fallback : out; };
  const [active, setActive] = useState(false);

  if (!values || values.length < 4) return null;

  const PAD = 2;
  const points = values
    .map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (width - PAD * 2);
      const y = PAD + (1 - v) * (height - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // Unchanged from the original: the line's own color is a strict two-tone
  // read on the endpoints, and stays exactly that -- the readout below adds a
  // third WORD ("Flat") for a near-level line without inventing a third
  // color the line itself never had.
  const up = values[values.length - 1] >= values[0];
  const strokeColor = up ? UP : FLAT_OR_DOWN;

  const first = values[0];
  const last = values[values.length - 1];
  const EPS = 0.03; // below this the line reads as level, not a direction
  const trend: "up" | "down" | "flat" = Math.abs(last - first) < EPS ? "flat" : up ? "up" : "down";
  const trendLabel = trend === "up" ? tf("charts.sparkTrendUp", "Up")
    : trend === "down" ? tf("charts.sparkTrendDown", "Down")
    : tf("charts.sparkTrendFlat", "Flat");
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  // The absolute figure behind this shape is stripped server-side before it
  // ever reaches the client (see normalizeSpark's caller) -- so the readout
  // describes the real normalised point honestly, as a position in the range
  // shown, rather than inventing a currency amount the component never had.
  const pct = Math.round(last * 100);
  const rangeLabel = tf("charts.sparkOfRange", "of range shown");

  return (
    <span
      tabIndex={0}
      role="group"
      aria-label={`${trendLabel}, ${pct}% ${rangeLabel}`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{ position: "relative", display: "inline-flex", flexShrink: 0, cursor: "default" }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
        focusable="false"
        style={{ display: "block" }}
      >
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {active && (
        <span
          role="tooltip"
          style={{
            position: "absolute", bottom: "calc(100% + 6px)", right: 0, zIndex: 30,
            whiteSpace: "nowrap",
            background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: "6px 8px",
            fontFamily: "'DM Sans', sans-serif", fontSize: "11px", lineHeight: 1.4,
          }}
        >
          <span style={{ color: strokeColor, fontWeight: 600 }}>{arrow} {trendLabel}</span>
          <span style={{ color: "var(--cr-ink-4)", fontWeight: 400 }}> &middot; {pct}% {rangeLabel}</span>
        </span>
      )}
    </span>
  );
}

/** Min-max scale a raw series to 0..1, the shape every `Sparkline` caller needs. */
export function normalizeSpark(raw: Array<number | null | undefined>): number[] {
  const vals = raw.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (vals.length < 4) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max === min) return vals.map(() => 0.5);
  return vals.map((v) => (v - min) / (max - min));
}
