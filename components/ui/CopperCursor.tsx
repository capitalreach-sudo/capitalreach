"use client";

import { useEffect, useState } from "react";

export function CopperCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [hovering, setHovering] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      if (!visible) setVisible(true);
    };
    const enter = (e: MouseEvent) => {
      const el = e.target as Element;
      if (el.closest('a, button, [role="button"]')) setHovering(true);
    };
    const leave = () => setHovering(false);
    const out = () => setVisible(false);

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseover", enter);
    document.addEventListener("mouseout", leave);
    document.addEventListener("mouseleave", out);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseover", enter);
      document.removeEventListener("mouseout", leave);
      document.removeEventListener("mouseleave", out);
    };
  }, [visible]);

  return (
    <div
      className="pointer-events-none fixed z-[9999] hidden lg:block"
      style={{
        left: pos.x,
        top: pos.y,
        transform: "translate(-50%, -50%)",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease",
      }}
    >
      <div
        style={{
          width: hovering ? 20 : 8,
          height: hovering ? 20 : 8,
          borderRadius: "50%",
          background: hovering ? "transparent" : "var(--cr-copper, #B5651D)",
          border: hovering ? "1.5px solid var(--cr-copper, #B5651D)" : "none",
          opacity: hovering ? 0.6 : 0.5,
          transition: "all 200ms cubic-bezier(.16,1,.3,1)",
        }}
      />
    </div>
  );
}
