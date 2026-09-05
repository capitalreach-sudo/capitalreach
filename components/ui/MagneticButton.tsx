"use client";

import { useRef } from "react";

/**
 * Primary CTAs pull toward the cursor within their own bounds. ONLY primary
 * copper buttons -- never ghosts, never links; repetition kills a signature.
 * Inert on touch devices and under reduced motion.
 */
export function MagneticButton({
  children, style, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  const active = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <button
      ref={ref}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el || !active()) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.18}px, ${dy * 0.18}px)`;
      }}
      onMouseLeave={() => { if (ref.current) ref.current.style.transform = ""; }}
      style={{ transition: "transform 300ms cubic-bezier(.2,.8,.2,1)", ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
