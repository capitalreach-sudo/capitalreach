"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts itself up the first time it scrolls into view, and
 * from then on FOLLOWS its value: later prop changes animate from the
 * current figure to the new one (the matcher's count froze at its first
 * result because the old version ran once and never looked again).
 * Under reduced motion it simply IS the number, always.
 */
export function CountUp({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const revealed = useRef(false);
  const shownRef = useRef(0);
  const raf = useRef(0);
  const initial = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A value that CHANGES means the user is interacting with whatever
    // feeds this number -- they are looking at it. Do not wait for an
    // observer that may never fire (hidden tabs, content-visibility).
    if (!revealed.current && value !== initial.current) revealed.current = true;

    const animateTo = (target: number, ms: number) => {
      cancelAnimationFrame(raf.current);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        shownRef.current = target; setShown(target); return;
      }
      const from = shownRef.current;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        const v = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
        shownRef.current = v; setShown(v);
        if (p < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    };

    if (revealed.current) { animateTo(value, 500); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || revealed.current) return;
      revealed.current = true;
      animateTo(value, duration);
      io.disconnect();
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>{shown}</span>;
}
