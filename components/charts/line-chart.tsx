"use client";

import { useId, useState } from "react";
import { SERIES, GRID, AXIS_TEXT } from "./palette";

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  /** Formats the value in the tooltip; defaults to the raw number. */
  format?: (n: number) => string;
}

/**
 * Change over time.
 *
 * The Data Centre reported totals, which say how big the platform is and
 * nothing about whether it is growing. A line answers the question the number
 * cannot: is this going up.
 *
 * Deliberately single-axis. Two measures on two scales in one frame is the
 * most common way a chart lies — any pair of lines can be made to cross
 * wherever you like by choosing the axes. Series with different units get
 * their own chart.
 */
export function LineChart({ labels, series, height = 200, valueLabel, formatTick }: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  valueLabel?: string;
  /** Axis tick text. Without it a currency axis reads "100000000". */
  formatTick?: (n: number) => string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  const W = 720, H = height;
  // The gutter has to fit the widest tick: a currency axis needs more room
  // than a count, and a label that overflows it lands on top of the plot.
  const PAD = { top: 12, right: 14, bottom: 26, left: formatTick ? 58 : 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const all = series.flatMap(s => s.values);
  const rawMax = Math.max(1, ...all);
  // A round ceiling, so the gridline labels are numbers a person would say.
  const step = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / step) * step || 1;

  const n = Math.max(labels.length, 1);
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const ticks = [0, max / 2, max];

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
        aria-label={valueLabel ?? series.map(s => s.label).join(", ")}
        onMouseLeave={() => setHover(null)}>
        {/* Recessive grid: present enough to read a value against, quiet
            enough that the data is what you see. */}
        {ticks.map(tv => (
          <g key={tv}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tv)} y2={y(tv)} stroke={GRID} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tv) + 3} textAnchor="end"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: AXIS_TEXT }}>
              {formatTick ? formatTick(tv) : Math.round(tv)}
            </text>
          </g>
        ))}

        {/* First, last, and middle only — twelve rotated month labels is a
            worse chart than three readable ones. */}
        {labels.map((l, i) => (
          (i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2)) ? (
            <text key={l} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9.5, fill: AXIS_TEXT }}>{l}</text>
          ) : null
        ))}

        {series.map((s, si) => {
          const colour = SERIES[si % SERIES.length];
          const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {/* The last point is labelled directly, so the line is
                  identifiable without travelling to the legend. */}
              {s.values.length > 0 && (
                <circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r={4}
                  fill={colour} stroke="var(--cr-paper)" strokeWidth={2} />
              )}
            </g>
          );
        })}

        {/* Hit targets are the full column height, not the 8px marker. */}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - plotW / (2 * Math.max(n - 1, 1))} y={PAD.top}
            width={plotW / Math.max(n - 1, 1)} height={plotH}
            fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke={AXIS_TEXT} strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s, si) => (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5}
                fill={SERIES[si % SERIES.length]} stroke="var(--cr-paper)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>

      {hover !== null && (
        <div style={{
          position: "absolute", top: 4, left: `${(x(hover) / W) * 100}%`,
          transform: `translateX(${hover > n / 2 ? "-105%" : "5%"})`,
          background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
          borderRadius: 4, padding: "6px 9px", pointerEvents: "none", zIndex: 2,
          boxShadow: "0 4px 14px rgba(0,0,0,0.10)", whiteSpace: "nowrap",
        }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 10.5, color: "var(--cr-ink)", marginBottom: 3 }}>
            {labels[hover]}
          </p>
          {series.map((s, si) => (
            <p key={s.key} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: "var(--cr-ink-3)", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: SERIES[si % SERIES.length], display: "inline-block" }} />
              {s.label}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--cr-ink)" }}>
                {s.format ? s.format(s.values[hover] ?? 0) : String(s.values[hover] ?? 0)}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* A legend whenever there is more than one line — identity is never
          carried by colour alone. */}
      {series.length > 1 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
          {series.map((s, si) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "var(--cr-ink-3)" }}>
              <span style={{ width: 9, height: 3, borderRadius: 2, background: SERIES[si % SERIES.length], display: "inline-block" }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <span id={id} hidden />
    </div>
  );
}
