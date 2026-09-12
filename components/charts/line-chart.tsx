"use client";

import { useId, useState } from "react";
import { SERIES } from "./palette";
import { plotCeiling } from "@/lib/validators";

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  /** Formats the value in the tooltip; defaults to the raw number. */
  format?: (n: number) => string;
}

interface Pt { i: number; v: number }

/**
 * Change over time.
 *
 * The Data Centre reported totals, which say how big the platform is and
 * nothing about whether it is growing. A line answers the question the number
 * cannot: is this going up.
 *
 * Deliberately single-axis. Two measures on two scales in one frame is the
 * most common way a chart lies -- any pair of lines can be made to cross
 * wherever you like by choosing the axes. Series with different units get
 * their own chart.
 */
export function LineChart({ labels, series, height = 200, valueLabel, formatTick, inProgressLast = false, inProgressLabel }: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  valueLabel?: string;
  /** Axis tick text. Without it a currency axis reads "100000000". */
  formatTick?: (n: number) => string;
  /** The final x-position is a period still being written (this month, this
      quarter). Its value is a partial count, not a collapse, so its leading
      segment draws dashed, its point renders hollow, and the flag appends
      inProgressLabel. The last COMPLETE point keeps the solid endpoint. */
  inProgressLast?: boolean;
  /** "so far", translated by the caller. */
  inProgressLabel?: string;
}) {
  const id = useId();
  // useId can contain ":", which a url(#…) reference will not survive.
  const gid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const [active, setActive] = useState<number | null>(null);

  const W = 720, H = height;
  // The gutter has to fit the widest tick: a currency axis needs more room
  // than a count, and a label that overflows it lands on top of the plot.
  const PAD = { top: 12, right: 14, bottom: 26, left: formatTick ? 58 : 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Every series shares one scale, so one bad value is everyone's problem.
  const max = plotCeiling(series.flatMap(s => s.values));

  const n = Math.max(labels.length, 1);
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const baseY = PAD.top + plotH;

  const ticks = [0, max / 2, max];

  const axisText: React.CSSProperties = {
    // The mono voice for anything on an axis: figures and month marks line
    // up because every glyph is the same width.
    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
    fontVariantNumeric: "tabular-nums", fill: "var(--cr-ink-4)",
  };

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
        aria-label={valueLabel ?? series.map(s => s.label).join(", ")}
        style={{ touchAction: "manipulation" }}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") setActive(null); }}>
        {/* Recessive grid: the baseline is a solid hairline the data stands
            on; the upper ticks are dotted, present enough to read a value
            against and quiet enough that the data is what you see. */}
        {ticks.map((tv, ti) => (
          <g key={ti}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tv)} y2={y(tv)}
              stroke="var(--cr-rule-dark)" strokeWidth={1}
              strokeDasharray={tv === 0 ? undefined : "2 4"} />
            <text x={PAD.left - 8} y={y(tv) + 3} textAnchor="end" style={axisText}>
              {formatTick ? formatTick(tv) : Math.round(tv)}
            </text>
          </g>
        ))}

        {/* First, last, and middle only -- twelve rotated month labels is a
            worse chart than three readable ones. */}
        {labels.map((l, i) => (
          (i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2)) ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              style={axisText}>{l}</text>
          ) : null
        ))}

        {series.map((s, si) => {
          const colour = SERIES[si % SERIES.length];
          // One NaN coordinate voids the whole path element, so a point that
          // isn't a number becomes a break in the line instead of an erased
          // series. Adjacent points join; a gap stays a gap, because a segment
          // drawn across it reads as data that was never measured.
          const pts: Pt[] = s.values.flatMap((v, i) => (Number.isFinite(v) ? [{ i, v }] : []));
          const runs: Pt[][] = [];
          for (const p of pts) {
            const cur = runs[runs.length - 1];
            if (cur && cur[cur.length - 1].i === p.i - 1) cur.push(p);
            else runs.push([p]);
          }

          const lastPt = pts[pts.length - 1];
          // The in-progress point exists only when the series actually
          // reaches the final x -- a series that ends earlier has no partial
          // period to disclose.
          const partial = inProgressLast && lastPt && lastPt.i === n - 1 ? lastPt : null;
          const lastReal = partial ? pts[pts.length - 2] : lastPt;

          // The solid line stops at the last complete point; the segment into
          // the in-progress period is drawn separately, dashed.
          const solidD = runs.map(run => {
            const seg = partial && run[run.length - 1].i === partial.i ? run.slice(0, -1) : run;
            if (seg.length === 0) return "";
            return seg.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ");
          }).filter(Boolean).join(" ");

          let dashedD = "";
          if (partial) {
            const run = runs[runs.length - 1];
            if (run.length >= 2 && run[run.length - 1].i === partial.i) {
              const a = run[run.length - 2];
              dashedD = `M${x(a.i)},${y(a.v)} L${x(partial.i)},${y(partial.v)}`;
            }
          }

          // The wash under the line also stops at the last complete point:
          // filling under a partial count would claim area the period has not
          // earned yet.
          const areaD = runs.map(run => {
            const seg = partial && run[run.length - 1].i === partial.i ? run.slice(0, -1) : run;
            if (seg.length < 2) return "";
            return `M${x(seg[0].i)},${baseY} ` + seg.map(p => `L${x(p.i)},${y(p.v)}`).join(" ")
              + ` L${x(seg[seg.length - 1].i)},${baseY} Z`;
          }).filter(Boolean).join(" ");

          return (
            <g key={s.key}>
              <defs>
                {/* Accent at low opacity via color-mix so the wash follows the
                    series colour through every theme without a second hue. */}
                <linearGradient id={`${gid}-f${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`color-mix(in srgb, ${colour} 14%, transparent)`} />
                  <stop offset="100%" stopColor={`color-mix(in srgb, ${colour} 2%, transparent)`} />
                </linearGradient>
              </defs>
              {areaD && <path d={areaD} fill={`url(#${gid}-f${si})`} />}
              <path d={solidD} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {dashedD && (
                <path d={dashedD} fill="none" stroke={colour} strokeWidth={2}
                  strokeLinecap="round" strokeDasharray="2 5" />
              )}
              {/* A point with a gap on both sides has no segment to appear in,
                  and a measurement that renders as nothing is the failure this
                  guard exists to prevent. */}
              {runs.filter(r => r.length === 1 && !(partial && r[0].i === partial.i)).map(r => (
                <circle key={r[0].i} cx={x(r[0].i)} cy={y(r[0].v)} r={2.5} fill={colour} />
              ))}
              {/* The last COMPLETE point is labelled directly, so the line is
                  identifiable without travelling to the legend. */}
              {lastReal && (
                <circle cx={x(lastReal.i)} cy={y(lastReal.v)} r={4}
                  fill={colour} stroke="var(--cr-paper)" strokeWidth={2} />
              )}
              {/* Hollow: the period is still being written. */}
              {partial && (
                <circle cx={x(partial.i)} cy={y(partial.v)} r={4}
                  fill="var(--cr-paper)" stroke={colour} strokeWidth={1.5} />
              )}
            </g>
          );
        })}

        {/* Hit targets are the full column height, not the 8px marker. Hover
            tracks the pointer; on touch, a tap pins the same flag and a
            second tap on the column releases it -- nothing here needs hover. */}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - plotW / (2 * Math.max(n - 1, 1))} y={PAD.top}
            width={plotW / Math.max(n - 1, 1)} height={plotH}
            fill="transparent"
            onPointerEnter={(e) => { if (e.pointerType !== "touch") setActive(i); }}
            onPointerDown={(e) => { if (e.pointerType === "touch") setActive(active === i ? null : i); }} />
        ))}

        {active !== null && (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH}
              stroke="var(--cr-ink-4)" strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s, si) => (
              Number.isFinite(s.values[active]) ? (
                <circle key={s.key} cx={x(active)} cy={y(s.values[active])} r={4.5}
                  fill={SERIES[si % SERIES.length]} stroke="var(--cr-paper)" strokeWidth={2} />
              ) : null
            ))}
          </g>
        )}
      </svg>

      {active !== null && (
        <div style={{
          position: "absolute", top: 4, left: `${(x(active) / W) * 100}%`,
          transform: `translateX(${active > n / 2 ? "-105%" : "5%"})`,
          background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
          // No shadow: the register separates surfaces with hairlines, and a
          // literal rgba here would be the one colour that ignores the theme.
          borderRadius: 4, padding: "6px 9px", pointerEvents: "none", zIndex: 2,
          whiteSpace: "nowrap",
        }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 10.5, color: "var(--cr-ink)", marginBottom: 3 }}>
            {labels[active]}
            {/* The flag says the number is provisional in the same breath as
                the number -- a partial month must never read as a collapse. */}
            {inProgressLast && active === n - 1 && inProgressLabel && (
              <span style={{ fontWeight: 400, color: "var(--cr-ink-4)" }}> · {inProgressLabel}</span>
            )}
          </p>
          {/* A series with nothing at this point gets no row, matching the
              break in its line. Reading it as zero would invent a measurement. */}
          {series.map((s, si) => (
            Number.isFinite(s.values[active]) ? (
              <p key={s.key} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: "var(--cr-ink-3)", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: SERIES[si % SERIES.length], display: "inline-block" }} />
                {s.label}
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: "var(--cr-ink)" }}>
                  {s.format ? s.format(s.values[active]) : String(s.values[active])}
                </span>
              </p>
            ) : null
          ))}
        </div>
      )}

      {/* A legend whenever there is more than one line -- identity is never
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
    </div>
  );
}
