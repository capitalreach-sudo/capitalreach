"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The AI score as an instrument: five arc segments around the number, one
 * per twenty points, the boundary segment part-filled so 50 no longer lights
 * the same arcs as 60. Reads at a glance from across the room, exact up
 * close. Lights up in sequence on mount; reduced motion lands it lit.
 */
export function ScoreDial({ score, size = 46 }: { score: number; size?: number }) {
  const { t } = useTranslation();
  const [lit, setLit] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    setLit(true);
    const on = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const sc = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const exact = sc / 20;
  const full = Math.floor(exact);
  const frac = exact - full;

  // Five segments across a 300-degree sweep, opening at the bottom.
  const segs = Array.from({ length: 5 }, (_, i) => {
    const a0 = 120 + i * 60 + 4;
    const a1 = 120 + (i + 1) * 60 - 4;
    const r = 19;
    const rad = (a: number) => [(24 + r * Math.cos((a * Math.PI) / 180)).toFixed(2), (24 + r * Math.sin((a * Math.PI) / 180)).toFixed(2)];
    const [x0, y0] = rad(a0);
    const [x1, y1] = rad(a1);
    // The boundary segment fills to its fraction; below a twentieth of a
    // segment the sliver would read as a rendering artefact, not a value.
    const fill = i < full ? 1 : i === full && frac >= 0.05 ? frac : 0;
    return { d: `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`, fill };
  });

  const label = `${t("listings.score")}: ${Math.round(sc)}/100`;

  return (
    <span role="img" aria-label={label} title={label} style={{ display: "inline-flex", flexShrink: 0 }}>
      <svg viewBox="0 0 48 48" width={size} height={size}>
        {/* The track first, so a part-filled segment shows the rest of its
            arc as unlit rather than as a hole. */}
        {segs.map((s, i) => (
          <path key={`t${i}`} d={s.d} fill="none" strokeWidth="3" strokeLinecap="butt"
            stroke="var(--cr-rule-dark)" />
        ))}
        {segs.map((s, i) => (
          s.fill > 0 ? (
            <path key={i} d={s.d} fill="none" strokeWidth="3" strokeLinecap="butt"
              stroke="var(--cr-copper)"
              pathLength={1}
              strokeDasharray={s.fill < 1 ? `${s.fill} 1` : undefined}
              style={{
                opacity: reduceMotion || lit ? 1 : 0,
                // The stagger is the light-up; under reduced motion there is
                // no delay to sit through and no fade.
                transition: reduceMotion ? "none" : `opacity 200ms ease ${i * 90}ms`,
              }} />
          ) : null
        ))}
        <text x="24" y="28.5" textAnchor="middle" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "13px", fontVariantNumeric: "tabular-nums", fill: "var(--cr-ink)" }}>
          {Math.round(sc)}
        </text>
      </svg>
    </span>
  );
}
