"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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

// The draw-in is a first-impression flourish: once per page load, not once
// per remount. Tab strips unmount and remount their panels, and a chart that
// redraws itself on every tab switch turns a courtesy into a tic. Module
// scope survives remounts; a full reload starts clean.
let hasDrawnOnce = false;

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
 *
 * The interactive layer ENHANCES and never gates (every tooltip value is also
 * on the end labels, the axis, or the table the caller keeps): a continuous
 * scrub (pointer, touch-drag, or arrow keys) drives one crosshair whose
 * readout lists every visible series; hovering a series' name emphasises it
 * and quiets the others; clicking a name folds that series away and the scale
 * re-fits what remains -- colour stays with the entity, so survivors are never
 * repainted. The first time a chart scrolls into view, each line draws
 * itself in -- once per page load, never again on a remount;
 * prefers-reduced-motion gets the finished frame immediately.
 */
export function LineChart({ labels, series, height = 200, valueLabel, formatTick, annotation }: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  valueLabel?: string;
  /** Axis tick text. Without it a currency axis reads "100000000". */
  formatTick?: (n: number) => string;
  /** One caption line under the frame for what the plotted domain cannot say
      for itself -- a period still in progress, a quiet run-up before the
      first point. Prose, not geometry: the plotted series carries only
      complete periods. */
  annotation?: string;
}) {
  const id = useId();
  // useId can contain ":", which a url(#…) reference will not survive.
  const gid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);

  // Identity interactions. `hidden` folds a series away (never the last one);
  // `focusKey` is the hover emphasis. Both key on s.key so colour -- assigned
  // by ORIGINAL index -- follows the entity through every toggle.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Motion: the draw-in runs once, when the frame first becomes visible.
  // Reduced-motion readers get the finished chart with no interlude, and an
  // environment without IntersectionObserver just starts drawn.
  const reduced = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const [drawn, setDrawn] = useState(reduced || hasDrawnOnce);
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (drawn) return;
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { hasDrawnOnce = true; setDrawn(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { hasDrawnOnce = true; setDrawn(true); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [drawn]);

  // The viewBox width tracks the container's real pixel width. A fixed 720
  // frame at width:100% scales every stroke and glyph with the container:
  // hairlines go soft, 9px axis text renders at 6px on a phone, and the
  // flag's percentage position drifts inside the letterbox gutters the
  // fixed ratio leaves at desktop widths. At 1:1 the 2px line is 2px.
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

  // Colour is assigned on the ORIGINAL roster; folding a series away must
  // never repaint the survivors.
  const roster = series.map((s, origIdx) => ({ s, origIdx }));
  const visible = roster.filter(({ s }) => !hidden.has(s.key));

  // Direct labels at the line ends replace the legend row, but only once the
  // frame is measured and wide enough to give the words a gutter without
  // starving the plot. Width is estimated from glyph count because SVG text
  // cannot be measured before it renders; the cap keeps a long translation
  // from eating the chart. Estimated from the FULL roster so toggling a
  // series never reflows the plot.
  const endLabels = series.length > 1 && measured !== null && W >= 560;
  const endGutter = endLabels
    ? Math.min(132, 16 + Math.max(...series.map(s => s.label.length)) * 5.8)
    : 0;

  // The gutter has to fit the widest tick: a currency axis needs more room
  // than a count, and a label that overflows it lands on top of the plot.
  const PAD = { top: 12, right: endLabels ? endGutter : 14, bottom: 26, left: formatTick ? 58 : 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Every VISIBLE series shares one scale, so folding the big one away lets
  // the small ones breathe -- which is the whole point of folding.
  const max = plotCeiling(visible.flatMap(({ s }) => s.values));

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
    // up because every glyph is the same width. 10px ink-3 -- charts are the
    // one licensed exception to the 11px floor.
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    fontVariantNumeric: "tabular-nums",
    fill: "var(--cr-ink-3)",
  };

  // The wash under a line is a single-series privilege: with two or more
  // lines visible the fills overlap into a claim about the space between
  // them, so the wash stands down and the lines carry the frame alone.
  const washed = visible.length < 2;

  // Geometry first, drawing second: the end-of-line labels need every
  // series' final point before any series renders. Every plotted point is a
  // COMPLETE period -- the caller truncates an in-progress one and owns it
  // in the annotation line instead.
  const geom = visible.map(({ s, origIdx }) => {
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

    const endPt = pts.length ? pts[pts.length - 1] : null;

    const solidD = runs.map(run =>
      run.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" "),
    ).filter(Boolean).join(" ");

    const areaD = runs.map(run => {
      if (run.length < 2) return "";
      return `M${x(run[0].i)},${baseY} ` + run.map(p => `L${x(p.i)},${y(p.v)}`).join(" ")
        + ` L${x(run[run.length - 1].i)},${baseY} Z`;
    }).filter(Boolean).join(" ");

    return { s, origIdx, runs, solidD, areaD, endPt };
  });

  // The label sits level with the line's true end, dashed tail included.
  // Two lines can end a pixel apart, so anchors closer than a line-height
  // push apart, then clamp back inside the plot from the bottom up.
  const labelY = new Map<number, number>();
  if (endLabels) {
    const GAP = 14;
    const anchors = geom
      .flatMap((g, gi) => (g.endPt ? [{ gi, ly: y(g.endPt.v) }] : []))
      .sort((a, b) => a.ly - b.ly);
    for (let k = 1; k < anchors.length; k++)
      anchors[k].ly = Math.max(anchors[k].ly, anchors[k - 1].ly + GAP);
    for (let k = anchors.length - 1; k >= 0; k--)
      anchors[k].ly = Math.min(anchors[k].ly, k === anchors.length - 1 ? baseY : anchors[k + 1].ly - GAP);
    for (const a of anchors) labelY.set(a.gi, a.ly);
  }

  // ── Interaction plumbing ──────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const indexFromClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const px = ((clientX - rect.left) / rect.width) * W;
    if (n === 1) return 0;
    const t = (px - PAD.left) / plotW;
    return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
  };

  const toggleSeries = (key: string) => {
    // The clicked label can unmount with the fold, so its mouseleave never
    // fires -- a stranded focusKey would leave the survivors dimmed forever.
    setFocusKey(null);
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        next.add(key);
        // Never fold the last visible series -- an empty chart answers nothing.
        if (next.size >= series.length) return prev;
      }
      return next;
    });
  };

  const dimFor = (key: string) => (focusKey && focusKey !== key ? 0.22 : 1);

  // Draw-in styling: pathLength=1 makes the dash math trivial. The dash
  // survives after the reveal (a single dash the length of the whole path is
  // invisible), so nothing needs cleaning up.
  const drawStyle = (gi: number): React.CSSProperties => reduced ? {} : {
    strokeDasharray: 1,
    strokeDashoffset: drawn ? 0 : 1,
    transition: `stroke-dashoffset 900ms cubic-bezier(0.4, 0, 0.2, 1) ${gi * 140}ms`,
  };
  const fadeStyle = (gi: number, base = 1): React.CSSProperties => reduced ? { opacity: base } : {
    opacity: drawn ? base : 0,
    transition: `opacity 600ms ease ${420 + gi * 140}ms`,
  };

  return (
    <div ref={frameRef} style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
        aria-label={valueLabel ?? series.map(s => s.label).join(", ")}
        className="cr-chart"
        tabIndex={0}
        // No inline outline: none -- it outranks .cr-chart:focus-visible and
        // hid the ring from the keyboard scrub this chart advertises.
        style={{ touchAction: "pan-y", display: "block" }}
        onKeyDown={(e) => {
          // The keyboard scrub: the same crosshair the pointer drives.
          if (e.key === "ArrowRight") { setActive(a => Math.min(n - 1, (a ?? -1) + 1)); e.preventDefault(); }
          else if (e.key === "ArrowLeft") { setActive(a => Math.max(0, (a ?? n) - 1)); e.preventDefault(); }
          else if (e.key === "Home") { setActive(0); e.preventDefault(); }
          else if (e.key === "End") { setActive(n - 1); e.preventDefault(); }
          else if (e.key === "Escape") { setActive(null); setPinned(false); }
        }}
        onBlur={() => { if (!pinned) setActive(null); }}
        onPointerLeave={(e) => { if (e.pointerType !== "touch" && !pinned) setActive(null); }}>
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

        {/* A short series names every month; a long one keeps first, last,
            and middle -- twelve rotated month labels is a worse chart than
            three readable ones. */}
        {labels.map((l, i) => (
          (n <= 8 || i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2)) ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              style={axisText}>{l}</text>
          ) : null
        ))}

        {geom.map((g, gi) => {
          const colour = SERIES[g.origIdx % SERIES.length];
          const ly = labelY.get(gi);
          return (
            <g key={g.s.key} style={{ opacity: dimFor(g.s.key), transition: "opacity 200ms ease" }}>
              <defs>
                {/* Accent at low opacity via color-mix so the wash follows
                    the series colour through every theme without a second
                    hue. Three stops ease it out instead of cutting it off:
                    the fill reads as the line's own shadow on the paper. */}
                <linearGradient id={`${gid}-f${g.origIdx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`color-mix(in srgb, ${colour} 14%, transparent)`} />
                  <stop offset="55%" stopColor={`color-mix(in srgb, ${colour} 5%, transparent)`} />
                  <stop offset="100%" stopColor={`color-mix(in srgb, ${colour} 0%, transparent)`} />
                </linearGradient>
              </defs>
              {washed && g.areaD && <path d={g.areaD} fill={`url(#${gid}-f${g.origIdx})`} style={fadeStyle(gi)} />}
              <path d={g.solidD} fill="none" stroke={colour} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round"
                pathLength={1} style={drawStyle(gi)} />
              {/* A point with a gap on both sides has no segment to appear in,
                  and a measurement that renders as nothing is the failure this
                  guard exists to prevent. */}
              {g.runs.filter(r => r.length === 1).map(r => (
                <circle key={r[0].i} cx={x(r[0].i)} cy={y(r[0].v)} r={2.5} fill={colour} style={fadeStyle(gi)} />
              ))}
              {/* The last point: a filled dot inside a quiet ring, so the
                  line ends with a full stop rather than trailing off. */}
              {g.endPt && (
                <g style={fadeStyle(gi)}>
                  <circle cx={x(g.endPt.i)} cy={y(g.endPt.v)} r={7}
                    fill="none" stroke={colour} strokeOpacity={0.25} strokeWidth={1} />
                  <circle cx={x(g.endPt.i)} cy={y(g.endPt.v)} r={3.5}
                    fill={colour} stroke="var(--cr-paper)" strokeWidth={1.5} />
                </g>
              )}
              {/* The name sits where the reader's eye already is when the
                  line runs out, in the series' own ink. Colour is not the
                  identifier here, position is; narrow frames fall back to
                  the legend row below. Hover emphasises; click folds. */}
              {endLabels && ly !== undefined && (
                <text x={W - PAD.right + 10} y={ly + 3.5} textAnchor="start"
                  role="button" aria-pressed={false}
                  onMouseEnter={() => setFocusKey(g.s.key)}
                  onMouseLeave={() => setFocusKey(null)}
                  onClick={() => toggleSeries(g.s.key)}
                  style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 500, fill: colour, cursor: "pointer", ...fadeStyle(gi) }}>
                  {g.s.label}
                </text>
              )}
            </g>
          );
        })}

        {/* The scrub layer: one surface over the whole plot. The pointer aims
            at a date, never at a 2px line -- position snaps to the nearest x.
            Touch drags to scrub; a tap pins the flag and a second tap lets go. */}
        <rect x={PAD.left} y={PAD.top} width={Math.max(plotW, 0)} height={Math.max(plotH, 0)}
          fill="transparent"
          onPointerMove={(e) => {
            if (e.pointerType === "touch" && !e.buttons) return;
            setActive(indexFromClientX(e.clientX));
          }}
          onPointerDown={(e) => {
            const i = indexFromClientX(e.clientX);
            if (e.pointerType === "touch") {
              if (pinned && active === i) { setPinned(false); setActive(null); }
              else { setPinned(true); setActive(i); }
            } else {
              setPinned(p => !p && active === i ? true : false);
              setActive(i);
            }
          }} />

        {active !== null && (
          <g pointerEvents="none">
            {/* The hairline glides between positions instead of teleporting --
                one group transform carries it, so the dots ride along. */}
            <g style={{ transform: `translateX(${x(active)}px)`, transition: reduced ? undefined : "transform 110ms cubic-bezier(0.4, 0, 0.2, 1)" }}>
              <line x1={0} x2={0} y1={PAD.top} y2={PAD.top + plotH}
                stroke="var(--cr-ink-4)" strokeWidth={1} strokeDasharray="3 3" />
            </g>
            {geom.map((g) => (
              Number.isFinite(g.s.values[active]) ? (
                <circle key={g.s.key} cx={x(active)} cy={y(g.s.values[active])} r={4.5}
                  fill={SERIES[g.origIdx % SERIES.length]} stroke="var(--cr-paper)" strokeWidth={2}
                  style={{ opacity: dimFor(g.s.key) }} />
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
          transition: reduced ? undefined : "left 110ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 10.5, color: "var(--cr-ink)", marginBottom: 4 }}>
            {labels[active]}
          </p>
          {/* A series with nothing at this point gets no row, matching the
              break in its line. Reading it as zero would invent a measurement.
              Ledger alignment: names left, figures flush right in the mono
              voice, so two rows compare down the column. */}
          {geom.map((g) => (
            Number.isFinite(g.s.values[active]) ? (
              <p key={g.s.key} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: "var(--cr-ink-3)", display: "flex", alignItems: "center", gap: 12, marginTop: 2, opacity: dimFor(g.s.key) }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 2, borderRadius: 1, background: SERIES[g.origIdx % SERIES.length], display: "inline-block" }} />
                  {g.s.label}
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--cr-ink)" }}>
                  {g.s.format ? g.s.format(g.s.values[active]) : String(g.s.values[active])}
                </span>
              </p>
            ) : null
          ))}
        </div>
      )}

      {/* The legend survives only where the end labels cannot fit -- identity
          is never carried by colour alone, and never by nothing at all. It is
          also the folding control everywhere the end labels are not: click
          folds a series away, click again brings it back; a folded chip keeps
          its colour key but drops to the quiet ink, struck through.

          It ALSO appears, even beside end labels, the moment anything is
          folded: a folded series' end label unmounts with its line, and a
          control that removes itself when used would strand the reader with
          no way back. */}
      {((!endLabels && series.length > 1) || hidden.size > 0) && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
          {roster.map(({ s, origIdx }) => {
            const off = hidden.has(s.key);
            return (
              <button key={s.key} type="button"
                onClick={() => toggleSeries(s.key)}
                onMouseEnter={() => setFocusKey(s.key)}
                onMouseLeave={() => setFocusKey(null)}
                aria-pressed={!off}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                  color: off ? "var(--cr-ink-4)" : "var(--cr-ink-3)",
                  textDecoration: off ? "line-through" : "none",
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                }}>
                <span style={{ width: 12, height: 2, borderRadius: 1, background: SERIES[origIdx % SERIES.length], display: "inline-block", opacity: off ? 0.35 : 1 }} />
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* One caption line owns what the frame cannot say for itself; it is
          prose, so it never bends the scale or dangles a provisional point. */}
      {annotation && (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 11, color: "var(--cr-ink-4)", marginTop: 12, maxWidth: 560, lineHeight: 1.6 }}>
          {annotation}
        </p>
      )}
    </div>
  );
}
