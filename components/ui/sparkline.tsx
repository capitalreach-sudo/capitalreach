"use client";

import { useEffect, useState } from "react";

/**
 * A 64×20 trend line: normalised points in, one polyline out. The endpoint
 * dot and the slope colour (up = green, down = red, flat = ink) are the only
 * standing emphasis -- a sparkline is read in half a second or not at all.
 *
 * Pass `values` (the raw series behind the normalised points) to make it
 * answerable: hover or tap then flags the nearest real figure in the mono
 * voice. Without raw values there is nothing honest to flag -- the normalised
 * numbers mean nothing -- so the line stays a decoration.
 */
export function Sparkline({ points, values, format, width = 64, height = 20 }: {
  points: number[];
  /** Raw figures behind `points`, same length; enables the hover/tap flag. */
  values?: number[];
  format?: (n: number) => string;
  width?: number;
  height?: number;
}) {
  const [held, setHeld] = useState<number | null>(null);
  // Hydration-safe reduced-motion check: first paint matches the server,
  // then the media query decides. The global CSS clamp shortens the draw but
  // cannot cancel the dot's 600ms delay, so that is handled here.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // A trend needs two measurements; below that there is nothing to slope,
  // and a lone unexplained dot is worse than nothing.
  const pts = points.flatMap((v, i) => (Number.isFinite(v) ? [{ i, v }] : []));
  if (pts.length < 2) return null;

  const pad = 2;
  const step = (width - pad * 2) / (points.length - 1);
  const xOf = (i: number) => pad + i * step;
  const y = (v: number) => pad + (1 - v) * (height - pad * 2);

  // Adjacent points join; a missing measurement stays a visible break rather
  // than a segment drawn across it.
  const runs: Array<Array<{ i: number; v: number }>> = [];
  for (const p of pts) {
    const cur = runs[runs.length - 1];
    if (cur && cur[cur.length - 1].i === p.i - 1) cur.push(p);
    else runs.push([p]);
  }

  const slope = pts[pts.length - 1].v - pts[0].v;
  const color = slope > 0.05 ? "var(--cr-up)" : slope < -0.05 ? "var(--cr-down)" : "var(--cr-ink-4)";
  const last = pts[pts.length - 1];

  const canFlag = !!values && values.length === points.length;
  const nearest = (clientX: number, el: SVGSVGElement): number => {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / Math.max(rect.width, 1)) * width;
    let best = pts[0].i, bestD = Infinity;
    for (const p of pts) {
      const d = Math.abs(xOf(p.i) - px);
      if (d < bestD) { bestD = d; best = p.i; }
    }
    return best;
  };

  const heldPt = held !== null ? pts.find(p => p.i === held) ?? null : null;
  // A finite normalised point can still sit over a raw hole; a flag must
  // never print NaN.
  const heldValue = canFlag && heldPt && Number.isFinite(values![heldPt.i]) ? values![heldPt.i] : null;

  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        aria-hidden={!canFlag || undefined}
        role={canFlag ? "img" : undefined}
        aria-label={canFlag ? (format ? format(values![last.i]) : String(values![last.i])) : undefined}
        style={{ flexShrink: 0, display: "block", touchAction: canFlag ? "manipulation" : undefined }}
        onPointerMove={canFlag ? (e) => { if (e.pointerType !== "touch") setHeld(nearest(e.clientX, e.currentTarget)); } : undefined}
        onPointerLeave={canFlag ? (e) => { if (e.pointerType !== "touch") setHeld(null); } : undefined}
        onPointerDown={canFlag ? (e) => {
          if (e.pointerType !== "touch") return;
          const i = nearest(e.clientX, e.currentTarget);
          setHeld(held === i ? null : i);
        } : undefined}>
        {runs.map((run, k) => (
          run.length === 1 ? (
            <circle key={k} cx={xOf(run[0].i)} cy={y(run[0].v)} r="1.5" fill={color} opacity="0.85" />
          ) : (
            <polyline key={k}
              points={run.map(p => `${xOf(p.i)},${y(p.v).toFixed(1)}`).join(" ")}
              fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85"
              pathLength={1}
              strokeDasharray={reduceMotion ? undefined : 1}
              strokeDashoffset={reduceMotion ? undefined : 1}
              style={reduceMotion ? undefined : { animation: "sparkDraw 700ms ease-out forwards" }} />
          )
        ))}
        <circle cx={xOf(last.i)} cy={y(last.v)} r="2" fill={color}
          style={reduceMotion ? undefined : { opacity: 0, animation: "sparkDot 200ms ease 600ms forwards" }} />
        {heldPt && (
          <circle cx={xOf(heldPt.i)} cy={y(heldPt.v)} r="2.5" fill="var(--cr-paper)"
            stroke={color} strokeWidth="1.5" pointerEvents="none" />
        )}
      </svg>
      {heldValue !== null && (
        <span style={{
          position: "absolute", bottom: "100%", marginBottom: 4,
          left: `${(xOf(heldPt!.i) / width) * 100}%`,
          transform: `translateX(${heldPt!.i > points.length / 2 ? "-90%" : "-10%"})`,
          background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
          borderRadius: 3, padding: "2px 6px", pointerEvents: "none", zIndex: 2,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          fontVariantNumeric: "tabular-nums", color: "var(--cr-ink)", whiteSpace: "nowrap",
        }}>
          {format ? format(heldValue) : String(heldValue)}
        </span>
      )}
    </span>
  );
}
