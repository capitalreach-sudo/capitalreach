"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  score: number | null;
  size?: number;
  strokeWidth?: number;
}

export function ScoreRing({ score, size = 40, strokeWidth = 3.5 }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const ref = useRef<SVGSVGElement>(null);
  const started = useRef(false);
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (score == null || started.current) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const duration = 1000;
          const tick = (now: number) => {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplayed(Math.round(eased * score));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [score]);

  if (score == null) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="var(--cr-paper-2, #EDE8DE)"
          stroke="var(--cr-paper-4, #C8BFB3)"
          strokeWidth={strokeWidth}
          strokeDasharray="4 4"
        />
      </svg>
    );
  }

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: "rotate(-90deg)" }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="var(--cr-paper-2, #EDE8DE)"
        stroke="var(--cr-paper-4, #C8BFB3)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--cr-copper, #B5651D)"
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeDasharray={`${(displayed / 100) * circumference} ${circumference}`}
        style={{ transition: "stroke-dasharray 50ms linear" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        dominantBaseline="middle"
        textAnchor="middle"
        fill="var(--cr-copper, #B5651D)"
        fontSize={size * 0.28}
        fontWeight="600"
        fontFamily="'JetBrains Mono', monospace"
        style={{
          transform: `rotate(90deg) translate(0px, ${-size / 2}px)`,
          transformOrigin: `${size / 2}px ${size / 2}px`,
        }}
      >
        {displayed}
      </text>
    </svg>
  );
}
