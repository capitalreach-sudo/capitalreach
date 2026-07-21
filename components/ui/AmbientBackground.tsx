"use client";

import { useEffect, useRef } from "react";

export function AmbientBackground() {
  const orbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const pct = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1);
      if (orbRef.current) {
        const y = pct * 120;
        const x = pct * -80;
        const opacity = 1 - pct * 0.75;
        const scale = 1 + pct * 0.2;
        orbRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        orbRef.current.style.opacity = String(opacity);
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ambient-bg" aria-hidden="true">
      <div ref={orbRef} className="ambient-bg-orb" />
    </div>
  );
}
