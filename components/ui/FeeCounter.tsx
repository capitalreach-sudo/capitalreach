"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  from?: number;   // start percentage e.g. 10
  to?: number;     // end percentage e.g. 2
  duration?: number; // ms
  className?: string;
}

export function FeeCounter({ from = 10, to = 2, duration = 1800, className = "" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(from);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); obs.disconnect(); } },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const range = from - to;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from - range * eased;
      setValue(Math.max(to, parseFloat(current.toFixed(1))));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [started, from, to, duration]);

  return (
    <span ref={ref} className={className}>
      <span style={{
        fontVariantNumeric: "tabular-nums",
        display: "inline-block",
        minWidth: "2.5ch",
        textAlign: "right",
      }}>
        {value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}
      </span>
      <span>%</span>
    </span>
  );
}
