"use client";

import { useState } from "react";
import Link from "next/link";
import { seriesColor } from "./palette";

export interface Bar { key: string; label: string; value: number; colorIndex?: number }

/**
 * Magnitude across categories -- the workhorse, and the right answer far more
 * often than a pie.
 *
 * Horizontal because the labels are words: a category name reads left to
 * right, and rotating it 45° to fit under a vertical bar makes a chart nobody
 * reads. Values sit at the end of each bar rather than on an axis, so the
 * number is where the eye already is -- which is also why nothing here is
 * gated on hover: a touch reader sees every figure without asking.
 */
export function BarChart({ bars, format, hrefFor }: {
  bars: Bar[];
  format?: (n: number) => string;
  /** Where a bar leads. A count is a question; the list behind it is the answer. */
  hrefFor?: (key: string) => string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map(b => b.value));
  const total = bars.reduce((s, b) => s + b.value, 0);

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
            // Mouse only: on touch, pointerenter fires on tap and there is no
            // matching leave, which left every other bar dimmed for good.
            onPointerEnter={(e) => { if (e.pointerType !== "touch") setHover(b.key); }}
            onPointerLeave={(e) => { if (e.pointerType !== "touch") setHover(null); }}
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
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontSize: 11.5, color: "var(--cr-ink)", minWidth: 34, textAlign: "right" }}>
              {format ? format(b.value) : b.value}
              {/* Share of the whole surfaces on hover. Rendered always and
                  faded in, so the column never resizes under the pointer;
                  hover-only because the figure itself is never hidden. */}
              {total > 0 && (
                <span aria-hidden={hover !== b.key} style={{
                  fontSize: 10, fontWeight: 400, color: "var(--cr-ink-4)", marginLeft: 6,
                  opacity: hover === b.key ? 1 : 0, transition: "opacity 120ms",
                }}>
                  {Math.round((b.value / total) * 100)}%
                </span>
              )}
            </span>
          </div>
          </div>
        );
      })}
    </div>
  );
}
