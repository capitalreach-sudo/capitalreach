"use client";

import { useState } from "react";
import Link from "next/link";
import { seriesColor, OTHER } from "./palette";

export interface Slice { key: string; label: string; value: number }

/**
 * Share of a whole, for a handful of categories.
 *
 * A donut earns its place only when the question is genuinely "what
 * proportion of the total" and the categories are few. Anything past six
 * slices is unreadable, so the tail is folded into "Other" — in grey, because
 * "everything else" is not a category and should not look like one.
 *
 * Every slice is labelled with its share, so nothing depends on telling two
 * colours apart.
 */
export function DonutChart({ slices, maxSlices = 5, otherLabel = "Other", total: totalOverride, hrefFor }: {
  slices: Slice[];
  maxSlices?: number;
  otherLabel?: string;
  total?: number;
  /** Where a slice leads. A share of a whole is a question; the list behind it is the answer. */
  hrefFor?: (key: string) => string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const sorted = [...slices].filter(s => s.value > 0).sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, maxSlices);
  const tail = sorted.slice(maxSlices);
  const shown = tail.length
    ? [...head, { key: "__other", label: otherLabel, value: tail.reduce((s, x) => s + x.value, 0) }]
    : head;

  const total = totalOverride ?? shown.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  const R = 54, r = 34, C = 70;
  let angle = -Math.PI / 2;

  const arc = (fraction: number) => {
    const start = angle;
    const sweep = fraction * Math.PI * 2;
    // A 2px gap between slices, expressed as an angle at this radius, so
    // neighbouring fills never touch and read as one shape.
    const gap = Math.min(sweep * 0.06, 0.045);
    const a0 = start + gap / 2, a1 = start + sweep - gap / 2;
    angle += sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`;
    return `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg viewBox="0 0 140 140" width={140} height={140} role="img" aria-label={shown.map(s => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}>
        {shown.map((s, i) => (
          <path key={s.key} d={arc(s.value / total)}
            fill={s.key === "__other" ? OTHER : seriesColor(i)}
            stroke="var(--cr-paper)" strokeWidth={hover === s.key ? 2 : 0}
            opacity={hover && hover !== s.key ? 0.45 : 1}
            onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
            style={{ transition: "opacity 120ms" }} />
        ))}
      </svg>

      <ul style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 150 }}>
        {shown.map((s, i) => {
          const pct = Math.round((s.value / total) * 1000) / 10;
          // "DeepTech is 8% of the platform" invites exactly one follow-up
          // question, and the answer is a list of companies. The row is that
          // link. "Other" is not a category, so it does not lead anywhere.
          const href = s.key === "__other" ? null : hrefFor?.(s.key) ?? null;
          const body = (
            <>
              <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0,
                background: s.key === "__other" ? OTHER : seriesColor(i) }} />
              <span style={{ flex: 1, textDecoration: href ? "underline" : "none", textUnderlineOffset: 3, textDecorationColor: "var(--cr-rule-dark)" }}>{s.label}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--cr-ink)" }}>{pct}%</span>
            </>
          );
          const style: React.CSSProperties = {
            display: "flex", alignItems: "center", gap: 7,
            fontFamily: "'DM Sans', sans-serif", fontSize: 11.5,
            color: hover && hover !== s.key ? "var(--cr-ink-4)" : "var(--cr-ink-3)",
            textDecoration: "none",
          };
          return (
            <li key={s.key}
              onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
              {href
                ? <Link href={href} style={{ ...style, cursor: "pointer" }}>{body}</Link>
                : <span style={style}>{body}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
