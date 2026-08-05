"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  from?: number;   // start percentage e.g. 10
  to?: number;     // end percentage e.g. 2 (the true, final value)
  duration?: number; // ms
  className?: string;
}

export function FeeCounter({ from = 10, to = 2, duration = 1800, className = "" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  // Rest at the true final value. If the count-down animation never runs
  // (reduced motion, a throttled background tab, or before the element scrolls
  // into view) the ad still correctly shows the real fee — never a higher,
  // misleading number.
  const [value, setValue] = useState(to);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        obs.disconnect();

        const start = performance.now();
        const range = from - to;
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          setValue(progress >= 1 ? to : parseFloat((from - range * eased).toFixed(1)));
          if (progress < 1) requestAnimationFrame(tick);
        };
        setValue(from);          // jump to the starting number…
        requestAnimationFrame(tick); // …then animate down to `to`
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [from, to, duration]);

  return (
    // `className` (e.g. the copper-foil gradient-text effect) is applied to each
    // leaf span individually, not this wrapper — background-clip:text doesn't
    // paint through into a descendant that establishes its own box (like the
    // inline-block digit span below), so it would otherwise render invisible.
    <span ref={ref}>
      <span className={className} style={{
        fontVariantNumeric: "tabular-nums",
        display: "inline-block",
        minWidth: "2.5ch",
        textAlign: "right",
      }}>
        {value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}
      </span>
      <span className={className}>%</span>
    </span>
  );
}
