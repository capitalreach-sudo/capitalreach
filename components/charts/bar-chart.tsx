"use client";

import { useState } from "react";
import Link from "next/link";
import { seriesColor, AXIS_TEXT } from "./palette";

export interface Bar { key: string; label: string; value: number; colorIndex?: number }

/**
 * Magnitude across categories — the workhorse, and the right answer far more
 * often than a pie.
 *
 * Horizontal because the labels are words: a category name reads left to
 * right, and rotating it 45° to fit under a vertical bar makes a chart nobody
 * reads. Values sit at the end of each bar rather than on an axis, so the
 * number is where the eye already is.
 */
export function BarChart({ bars, format, hrefFor }: {
  bars: Bar[];
  format?: (n: number) => string;
  /** Where a bar leads. A count is a question; the list behind it is the answer. */
  hrefFor?: (key: string) => string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map(b => b.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {bars.map((b, i) => {
        const pct = (b.value / max) * 100;
        const href = hrefFor?.(b.key) ?? null;
        const rowStyle: React.CSSProperties = {
          display: "grid", gridTemplateColumns: "minmax(90px, 130px) 1fr auto",
          alignItems: "center", gap: 10, textDecoration: "none",
          cursor: href ? "pointer" : "default",
        };
        const label = (
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: "var(--cr-ink-3)", textDecoration: href ? "underline" : "none", textUnderlineOffset: 3, textDecorationColor: "var(--cr-rule-dark)" }}>{b.label}</span>
        );
        return (
          <div key={b.key}
            onMouseEnter={() => setHover(b.key)} onMouseLeave={() => setHover(null)}
            style={{ display: "contents" }}>
          <div style={rowStyle}>
            {href ? <Link href={href} style={{ textDecoration: "none" }}>{label}</Link> : label}
            <div style={{ height: 10, background: "var(--cr-paper-3)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{
                width: `${Math.max(pct, b.value > 0 ? 2 : 0)}%`, height: "100%",
                // Rounded only at the data end; the baseline end stays square
                // so every bar starts from the same visual zero.
                borderRadius: "0 5px 5px 0",
                background: seriesColor(b.colorIndex ?? i),
                opacity: hover && hover !== b.key ? 0.55 : 1,
                transition: "width 260ms ease, opacity 120ms",
              }} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "var(--cr-ink)", minWidth: 34, textAlign: "right" }}>
              {format ? format(b.value) : b.value}
            </span>
          </div>
          </div>
        );
      })}
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9.5, color: AXIS_TEXT }} aria-hidden />
    </div>
  );
}
