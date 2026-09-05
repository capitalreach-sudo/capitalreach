"use client";

import { useTranslation } from "@/hooks/useTranslation";

/**
 * The AI score as an instrument: five arc segments around the number, one
 * lit per twenty points. Reads at a glance from across the room, exact up
 * close. Fills via CSS transition on mount; reduced motion lands it lit.
 */
export function ScoreDial({ score, size = 46 }: { score: number; size?: number }) {
  const { t } = useTranslation();
  const lit = Math.max(0, Math.min(5, Math.round(score / 20)));
  // Five segments across a 300-degree sweep, opening at the bottom.
  const segs = Array.from({ length: 5 }, (_, i) => {
    const a0 = 120 + i * 60 + 4;
    const a1 = 120 + (i + 1) * 60 - 4;
    const r = 19;
    const rad = (a: number) => [(24 + r * Math.cos((a * Math.PI) / 180)).toFixed(2), (24 + r * Math.sin((a * Math.PI) / 180)).toFixed(2)];
    const [x0, y0] = rad(a0);
    const [x1, y1] = rad(a1);
    return { d: `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`, on: i < lit };
  });
  return (
    <span role="img" aria-label={`${t("listings.score")}: ${score}/100`} style={{ display: "inline-flex", flexShrink: 0 }}>
      <svg viewBox="0 0 48 48" width={size} height={size}>
        {segs.map((s, i) => (
          <path key={i} d={s.d} fill="none" strokeWidth="3" strokeLinecap="butt"
            stroke={s.on ? "var(--cr-copper)" : "var(--cr-rule-dark)"}
            style={s.on ? { transition: `stroke 200ms ease ${i * 90}ms` } : undefined} />
        ))}
        <text x="24" y="28.5" textAnchor="middle" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "13px", fill: "var(--cr-ink)" }}>
          {score}
        </text>
      </svg>
    </span>
  );
}
