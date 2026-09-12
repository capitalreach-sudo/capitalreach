"use client";

import { useEffect, useId, useRef, useState } from "react";
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

  // The viewBox width tracks the container's real pixel width. A fixed 720
  // frame at width:100% scales every stroke and glyph with the container:
  // hairlines go soft, 9px axis text renders at 6px on a phone, and the
  // flag's percentage position drifts inside the letterbox gutters the
  // fixed ratio leaves at desktop widths. At 1:1 the 2px line is 2px.
  const frameRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setMeasured(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = measured ?? 720;
  const H = height;

  // Direct labels at the line ends replace the legend row, but only once the
  // frame is measured and wide enough to give the words a gutter without
  // starving the plot. Width is estimated from glyph count because SVG text
  // cannot be measured before it renders; the cap keeps a long translation
  // from eating the chart.
  const endLabels = series.length > 1 && measured !== null && W >= 560;
  const endGutter = endLabels
    ? Math.min(132, 16 + Math.max(...series.map(s => s.label.length)) * 5.8)
    : 0;

  // The gutter has to fit the widest tick: a currency axis needs more room
  // than a count, and a label that overflows it lands on top of the plot.
  const PAD = { top: 12, right: endLabels ? endGutter : 14, bottom: 26, left: formatTick ? 58 : 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Every series shares one scale, so one bad value is everyone's problem.
  const max = plotCeiling(series.flatMap(s => s.values));

  const n = Math.max(labels.length, 1);
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const baseY = PAD.top + plotH;

  // Friendly steps only. The ceiling is one significant figure by
  // construction; halving an odd count would print "4.5" on an axis of whole
  // things, so the midpoint rounds and sits at its true height instead. A
  // formatted axis (money) keeps the exact half: "2.5M" is a number a person
  // says.
  const half = max / 2;
  const mid = Number.isInteger(half) || formatTick ? half : Math.round(half);
  const ticks = mid > 0 && mid < max ? [0, mid, max] : [0, max];

  const axisText: React.CSSProperties = {
    // The mono voice for anything on an axis: figures and month marks line
    // up because every glyph is the same width. Faded a step past ink-4 so
    // the scale is available without competing with the drawn line.
    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
    fontVariantNumeric: "tabular-nums",
    fill: "color-mix(in srgb, var(--cr-ink-4) 78%, transparent)",
  };

  // Geometry first, drawing second: the end-of-line labels need every
  // series' final point before any series renders.
  const geom = series.map((s) => {
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

    const lastPt = pts.length ? pts[pts.length - 1] : null;
    // The in-progress point exists only when the series actually reaches
    // the final x -- a series that ends earlier has no partial period to
    // disclose.
    const partial = inProgressLast && lastPt && lastPt.i === n - 1 ? lastPt : null;
    const lastReal = partial ? (pts.length > 1 ? pts[pts.length - 2] : null) : lastPt;

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

    return { s, runs, partial, lastReal, solidD, dashedD, areaD, endPt: lastPt };
  });

  // The label sits level with the line's true end, dashed tail included.
  // Two lines can end a pixel apart, so anchors closer than a line-height
  // push apart, then clamp back inside the plot from the bottom up.
  const labelY = new Map<number, number>();
  if (endLabels) {
    const GAP = 14;
    const anchors = geom
      .flatMap((g, si) => (g.endPt ? [{ si, ly: y(g.endPt.v) }] : []))
      .sort((a, b) => a.ly - b.ly);
    for (let k = 1; k < anchors.length; k++)
      anchors[k].ly = Math.max(anchors[k].ly, anchors[k - 1].ly + GAP);
    for (let k = anchors.length - 1; k >= 0; k--)
      anchors[k].ly = Math.min(anchors[k].ly, k === anchors.length - 1 ? baseY : anchors[k + 1].ly - GAP);
    for (const a of anchors) labelY.set(a.si, a.ly);
  }

  return (
    <div ref={frameRef} style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
        aria-label={valueLabel ?? series.map(s => s.label).join(", ")}
        style={{ touchAction: "manipulation", display: "block" }}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") setActive(null); }}>
        {/* Recessive grid: the baseline is a solid hairline the data stands
            on; the upper rules are true dots, present enough to read a value
            against and quiet enough that the line is the loudest thing in
            the frame. No verticals, ever. Half-pixel snap keeps a 1px rule
            one crisp pixel instead of two soft ones. */}
        {ticks.map((tv, ti) => {
          const yy = Math.round(y(tv)) + 0.5;
          return (
            <g key={ti}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yy} y2={yy}
                stroke="var(--cr-rule-dark)" strokeWidth={1}
                strokeDasharray={tv === 0 ? undefined : "1 5"}
                strokeLinecap={tv === 0 ? undefined : "round"} />
              <text x={PAD.left - 8} y={yy + 3} textAnchor="end" style={axisText}>
                {formatTick ? formatTick(tv) : Math.round(tv)}
              </text>
            </g>
          );
        })}

        {/* First, last, and middle only -- twelve rotated month labels is a
            worse chart than three readable ones. */}
        {labels.map((l, i) => (
          (i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2)) ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              style={axisText}>{l}</text>
          ) : null
        ))}

        {geom.map((g, si) => {
          const colour = SERIES[si % SERIES.length];
          const ly = labelY.get(si);
          return (
            <g key={g.s.key}>
              <defs>
                {/* Accent at low opacity via color-mix so the wash follows
                    the series colour through every theme without a second
                    hue. Three stops ease it out instead of cutting it off:
                    the fill reads as the line's own shadow on the paper. */}
                <linearGradient id={`${gid}-f${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`color-mix(in srgb, ${colour} 14%, transparent)`} />
                  <stop offset="55%" stopColor={`color-mix(in srgb, ${colour} 5%, transparent)`} />
                  <stop offset="100%" stopColor={`color-mix(in srgb, ${colour} 0%, transparent)`} />
                </linearGradient>
              </defs>
              {g.areaD && <path d={g.areaD} fill={`url(#${gid}-f${si})`} />}
              <path d={g.solidD} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {g.dashedD && (
                <path d={g.dashedD} fill="none" stroke={colour} strokeWidth={2}
                  strokeLinecap="round" strokeDasharray="2 5" />
              )}
              {/* A point with a gap on both sides has no segment to appear in,
                  and a measurement that renders as nothing is the failure this
                  guard exists to prevent. */}
              {g.runs.filter(r => r.length === 1 && !(g.partial && r[0].i === g.partial.i)).map(r => (
                <circle key={r[0].i} cx={x(r[0].i)} cy={y(r[0].v)} r={2.5} fill={colour} />
              ))}
              {/* The last COMPLETE point: a filled dot inside a quiet ring,
                  so the line ends with a full stop rather than trailing off. */}
              {g.lastReal && (
                <g>
                  <circle cx={x(g.lastReal.i)} cy={y(g.lastReal.v)} r={7}
                    fill="none" stroke={colour} strokeOpacity={0.25} strokeWidth={1} />
                  <circle cx={x(g.lastReal.i)} cy={y(g.lastReal.v)} r={3.5}
                    fill={colour} stroke="var(--cr-paper)" strokeWidth={1.5} />
                </g>
              )}
              {/* Hollow: the period is still being written. */}
              {g.partial && (
                <circle cx={x(g.partial.i)} cy={y(g.partial.v)} r={4}
                  fill="var(--cr-paper)" stroke={colour} strokeWidth={1.5} />
              )}
              {/* The name sits where the reader's eye already is when the
                  line runs out, in the series' own ink. Colour is not the
                  identifier here, position is; narrow frames fall back to
                  the legend row below. */}
              {endLabels && ly !== undefined && (
                <text x={W - PAD.right + 10} y={ly + 3.5} textAnchor="start"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 500, fill: colour }}>
                  {g.s.label}
                </text>
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
          borderRadius: 4, padding: "8px 12px", pointerEvents: "none", zIndex: 2,
          whiteSpace: "nowrap", minWidth: 132,
        }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 10.5, color: "var(--cr-ink)", marginBottom: 4 }}>
            {labels[active]}
            {/* The flag says the number is provisional in the same breath as
                the number -- a partial month must never read as a collapse. */}
            {inProgressLast && active === n - 1 && inProgressLabel && (
              <span style={{ fontWeight: 400, color: "var(--cr-ink-4)" }}> · {inProgressLabel}</span>
            )}
          </p>
          {/* A series with nothing at this point gets no row, matching the
              break in its line. Reading it as zero would invent a measurement.
              Ledger alignment: names left, figures flush right in the mono
              voice, so two rows compare down the column. */}
          {series.map((s, si) => (
            Number.isFinite(s.values[active]) ? (
              <p key={s.key} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: "var(--cr-ink-3)", display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 2, borderRadius: 1, background: SERIES[si % SERIES.length], display: "inline-block" }} />
                  {s.label}
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--cr-ink)" }}>
                  {s.format ? s.format(s.values[active]) : String(s.values[active])}
                </span>
              </p>
            ) : null
          ))}
        </div>
      )}

      {/* The legend survives only where the end labels cannot fit -- identity
          is never carried by colour alone, and never by nothing at all. */}
      {!endLabels && series.length > 1 && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
          {series.map((s, si) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "var(--cr-ink-3)" }}>
              <span style={{ width: 12, height: 2, borderRadius: 1, background: SERIES[si % SERIES.length], display: "inline-block" }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
