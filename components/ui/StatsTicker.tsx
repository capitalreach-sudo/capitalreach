"use client";

import { useEffect, useRef } from "react";

interface TickerItem {
  label: string;
  value: string;
}

interface Props {
  items: TickerItem[];
  speed?: number; // pixels per second
}

export function StatsTicker({ items, speed = 40 }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Duplicate items so the scroll loops seamlessly
  const doubled = [...items, ...items];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    // Total width of one set = half of the scrollWidth
    let raf: number;
    let pos = 0;
    let lastTime: number | null = null;

    const step = (now: number) => {
      if (lastTime === null) lastTime = now;
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const half = track.scrollWidth / 2;
      pos += speed * dt;
      if (pos >= half) pos -= half;
      track.style.transform = `translateX(-${pos}px)`;
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  return (
    <div
      style={{
        overflow: "hidden",
        width: "100%",
        position: "relative",
        borderTop: "1px solid #D8D0C4",
        borderBottom: "1px solid #D8D0C4",
        padding: "10px 0",
      }}
    >
      {/* Fade edges */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: "80px", zIndex: 2,
        background: "linear-gradient(to right, var(--bg, #F5F0E8), transparent)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: "80px", zIndex: 2,
        background: "linear-gradient(to left, var(--bg, #F5F0E8), transparent)",
        pointerEvents: "none",
      }} />

      <div
        ref={trackRef}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          willChange: "transform",
          whiteSpace: "nowrap",
        }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              paddingRight: "48px",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <span style={{
              fontSize: "14px", fontWeight: 700, color: "#B5651D",
              letterSpacing: "0.01em",
            }}>
              {item.value}
            </span>
            <span style={{
              fontSize: "12px", fontWeight: 400, color: "#6B6056",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {item.label}
            </span>
            <span style={{
              width: "4px", height: "4px", borderRadius: "50%",
              background: "#D8D0C4", display: "inline-block", flexShrink: 0,
              marginLeft: "12px",
            }} />
          </span>
        ))}
      </div>
    </div>
  );
}
