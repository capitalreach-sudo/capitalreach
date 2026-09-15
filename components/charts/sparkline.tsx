/**
 * A trend in about a thumbnail's worth of space.
 *
 * Extracted from the inline `Sparkline` in `components/startup/startups-search.tsx`
 * (the directory card's MRR trend) so the profile page can draw the same shape
 * from `startup_metrics` without a second implementation. Behaviour is
 * unchanged from the original: a bare polyline, no axis, no labels, caller
 * supplies values already normalised to 0..1. It sits beside a labelled
 * figure (a card's raise strip, a metric cell), so it stays `aria-hidden` --
 * the number next to it is the accessible content.
 *
 * Needs at least 4 points to read as a trend; fewer than that is noise, so it
 * renders nothing rather than a two-point line pretending to be a chart.
 *
 * No CSS transition/animation is added here (static SVG paint, same as its
 * `line-chart`/`donut-chart`/`bar-chart` siblings) so there is nothing for
 * `prefers-reduced-motion` to need to turn off.
 */

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
  if (!values || values.length < 4) return null;

  const PAD = 2;
  const points = values
    .map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (width - PAD * 2);
      const y = PAD + (1 - v) * (height - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={up ? UP : FLAT_OR_DOWN}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
