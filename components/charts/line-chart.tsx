"use client";

import { useEffect, useRef, useState } from "react";
import { SERIES } from "./palette";
import { plotCeiling } from "@/lib/validators";

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  /** Formats the value in the readout; defaults to the raw number. */
  format?: (n: number) => string;
  /** Stroke colour as a token expression. Defaults to the palette slot for
   *  the series' position, so colour follows the entity. */
  color?: string;
}

interface Pt { i: number; v: number }

const SANS = "var(--font-dm-sans), system-ui, sans-serif";
const MONO = "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace";

/**
 * Change over time, drawn static.
 *
 * Single-axis on purpose: two measures on two scales in one frame can be made
 * to cross wherever the axes are chosen. Series with different units get
 * their own chart.
 *
 * Every value the readout shows is also reachable without it (end labels,
 * the axis, and the table each caller keeps beside the chart). The readout
 * follows a pointer, a touch drag, or the arrow keys. Nothing animates: no
 * draw-in, no folding, no pinned flag, no wash.
 */
export function LineChart({ labels, series, height = 200, valueLabel, formatTick, annotation }: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  /** Accessible name for the frame. Pass a sentence generated from the data. */
  valueLabel?: string;
  /** Axis tick text. Without it a currency axis reads "100000000". */
  formatTick?: (n: number) => string;
  /** One 13px line under the frame, for what the plotted domain cannot say. */
  annotation?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  // The viewBox tracks the container's real width so a 1px rule stays one
  // crisp pixel and 13px text renders at 13px on a phone.
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

  const colourOf = (s: LineSeries, index: number) => s.color ?? SERIES[index % SERIES.length];

  // Names sit at the line ends once the frame is wide enough to give them a
  // gutter; narrower frames get a static key row under the plot instead.
  // Glyph width is estimated because SVG text cannot be measured pre-render.
  const endLabels = series.length > 1 && measured !== null && W >= 560;
  const endGutter = endLabels
    ? Math.min(144, 16 + Math.max(...series.map(s => s.label.length)) * 7)
    : 0;

  const PAD = { top: 12, right: endLabels ? endGutter : 16, bottom: 24, left: formatTick ? 64 : 40 };
  const plotW = Math.max(W - PAD.left - PAD.right, 0);
  const plotH = Math.max(H - PAD.top - PAD.bottom, 0);

  const max = plotCeiling(series.flatMap(s => s.values));

  const n = Math.max(labels.length, 1);
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  // Friendly steps only: halving an odd count would print "4.5" on an axis of
  // whole things, so the midpoint rounds unless the axis is formatted money.
  const half = max / 2;
  const mid = Number.isInteger(half) || formatTick ? half : Math.round(half);
  const ticks = mid > 0 && mid < max ? [0, mid, max] : [0, max];

  const axisText: React.CSSProperties = {
    fontFamily: SANS, fontSize: 13, fontWeight: 400,
    fontVariantNumeric: "tabular-nums",
    fill: "var(--cr-ink-3)",
  };

  const geom = series.map((s, index) => {
    // A non-number breaks the line instead of voiding the whole path.
    const pts: Pt[] = s.values.flatMap((v, i) => (Number.isFinite(v) ? [{ i, v }] : []));
    const runs: Pt[][] = [];
    for (const p of pts) {
      const cur = runs[runs.length - 1];
      if (cur && cur[cur.length - 1].i === p.i - 1) cur.push(p);
      else runs.push([p]);
    }
    const d = runs.map(run =>
      run.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" "),
    ).filter(Boolean).join(" ");
    return { s, index, runs, d, endPt: pts.length ? pts[pts.length - 1] : null };
  });

  // End labels level with each line's last point; anchors closer than one
  // line of text push apart, then clamp back inside the plot.
  const labelY = new Map<number, number>();
  if (endLabels) {
    const GAP = 16;
    const baseY = PAD.top + plotH;
    const anchors = geom
      .flatMap((g, gi) => (g.endPt ? [{ gi, ly: y(g.endPt.v) }] : []))
      .sort((a, b) => a.ly - b.ly);
    for (let k = 1; k < anchors.length; k++)
      anchors[k].ly = Math.max(anchors[k].ly, anchors[k - 1].ly + GAP);
    for (let k = anchors.length - 1; k >= 0; k--)
      anchors[k].ly = Math.min(anchors[k].ly, k === anchors.length - 1 ? baseY : anchors[k + 1].ly - GAP);
    for (const a of anchors) labelY.set(a.gi, a.ly);
  }

  const svgRef = useRef<SVGSVGElement>(null);
  const indexFromClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || n === 1) return 0;
    const px = ((clientX - rect.left) / rect.width) * W;
    const t = (px - PAD.left) / (plotW || 1);
    return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
  };

  return (
    <div ref={frameRef} style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
        aria-label={valueLabel ?? series.map(s => s.label).join(", ")}
        className="cr-chart"
        tabIndex={0}
        style={{ touchAction: "pan-y", display: "block" }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { setActive(a => Math.min(n - 1, (a ?? -1) + 1)); e.preventDefault(); }
          else if (e.key === "ArrowLeft") { setActive(a => Math.max(0, (a ?? n) - 1)); e.preventDefault(); }
          else if (e.key === "Home") { setActive(0); e.preventDefault(); }
          else if (e.key === "End") { setActive(n - 1); e.preventDefault(); }
          else if (e.key === "Escape") setActive(null);
        }}
        onBlur={() => setActive(null)}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") setActive(null); }}>
        {/* The baseline is solid; upper rules are dotted and quiet. Half-pixel
            snap keeps each rule one device pixel. */}
        {ticks.map((tv, ti) => {
          const yy = Math.round(y(tv)) + 0.5;
          return (
            <g key={ti}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yy} y2={yy}
                stroke="var(--cr-rule-dark)" strokeWidth={1}
                strokeDasharray={tv === 0 ? undefined : "1 4"}
                strokeLinecap={tv === 0 ? undefined : "round"} />
              <text x={PAD.left - 8} y={yy + 4} textAnchor="end" style={axisText}>
                {formatTick ? formatTick(tv) : Math.round(tv)}
              </text>
            </g>
          );
        })}

        {/* Short series name every period; long ones keep first, middle, last. */}
        {labels.map((l, i) => (
          (n <= 8 || i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2)) ? (
            <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              style={axisText}>{l}</text>
          ) : null
        ))}

        {geom.map((g, gi) => {
          const colour = colourOf(g.s, g.index);
          const ly = labelY.get(gi);
          return (
            <g key={g.s.key}>
              <path d={g.d} fill="none" stroke={colour} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" />
              {/* An isolated point has no segment to appear in. */}
              {g.runs.filter(r => r.length === 1).map(r => (
                <circle key={r[0].i} cx={x(r[0].i)} cy={y(r[0].v)} r={2.5} fill={colour} />
              ))}
              {g.endPt && (
                <circle cx={x(g.endPt.i)} cy={y(g.endPt.v)} r={3.5}
                  fill={colour} stroke="var(--cr-paper)" strokeWidth={1.5} />
              )}
              {endLabels && ly !== undefined && (
                <text x={W - PAD.right + 12} y={ly + 4} textAnchor="start"
                  style={{ fontFamily: SANS, fontSize: 13, fontWeight: 400, fill: "var(--cr-ink-2)" }}>
                  {g.s.label}
                </text>
              )}
            </g>
          );
        })}

        {/* One scrub surface over the plot: position snaps to the nearest
            period, so the pointer aims at a date rather than a 2px line. */}
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH}
          fill="transparent"
          onPointerMove={(e) => {
            if (e.pointerType === "touch" && !e.buttons) return;
            setActive(indexFromClientX(e.clientX));
          }}
          onPointerDown={(e) => {
            const i = indexFromClientX(e.clientX);
            setActive(a => (e.pointerType === "touch" && a === i ? null : i));
          }} />

        {active !== null && (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH}
              stroke="var(--cr-ink-4)" strokeWidth={1} strokeDasharray="4 4" />
            {geom.map((g) => (
              Number.isFinite(g.s.values[active]) ? (
                <circle key={g.s.key} cx={x(active)} cy={y(g.s.values[active])} r={4}
                  fill={colourOf(g.s, g.index)} stroke="var(--cr-paper)" strokeWidth={2} />
              ) : null
            ))}
          </g>
        )}
      </svg>

      {active !== null && (
        <div aria-hidden style={{
          position: "absolute", top: 4, left: `${(x(active) / W) * 100}%`,
          transform: `translateX(${active > n / 2 ? "calc(-100% - 8px)" : "8px"})`,
          background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
          borderRadius: 4, padding: "8px 12px", pointerEvents: "none",
          zIndex: "var(--z-raised)",
          whiteSpace: "nowrap",
        }}>
          <p style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, lineHeight: 1.4, color: "var(--cr-ink)", margin: 0 }}>
            {labels[active]}
          </p>
          {/* A series with nothing at this point gets no row: reading a gap
              as zero would invent a measurement. */}
          {geom.map((g) => (
            Number.isFinite(g.s.values[active]) ? (
              <p key={g.s.key} style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.4, color: "var(--cr-ink-3)", display: "flex", alignItems: "center", gap: 12, margin: "4px 0 0" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 2, background: colourOf(g.s, g.index), display: "inline-block" }} />
                  {g.s.label}
                </span>
                <span style={{ marginInlineStart: "auto", fontFamily: MONO, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--cr-ink)" }}>
                  {g.s.format ? g.s.format(g.s.values[active]) : String(g.s.values[active])}
                </span>
              </p>
            ) : null
          ))}
        </div>
      )}

      {/* Identity is never carried by colour alone: where end labels cannot
          fit, a static key names each line. */}
      {!endLabels && series.length > 1 && (
        <div aria-hidden style={{ display: "flex", gap: "8px 16px", flexWrap: "wrap", marginTop: 8 }}>
          {series.map((s, index) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 13, lineHeight: 1.4, color: "var(--cr-ink-3)" }}>
              <span style={{ width: 12, height: 2, background: colourOf(s, index), display: "inline-block" }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {annotation && (
        <p style={{ fontFamily: SANS, fontWeight: 400, fontSize: 13, color: "var(--cr-ink-3)", marginTop: 12, maxWidth: "60ch", lineHeight: 1.4 }}>
          {annotation}
        </p>
      )}
    </div>
  );
}
