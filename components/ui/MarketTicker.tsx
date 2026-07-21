"use client";

import { useRef, useEffect } from "react";

export type TrendDirection = "up" | "down" | "neutral";

interface TickerItem {
  label: string;
  value: string;
  trend?: TrendDirection;
}

interface Props {
  items: TickerItem[];
  speed?: number; // pixels per second
}

function TrendIndicator({ trend }: { trend: TrendDirection }) {
  if (trend === "neutral") return null;
  const up = trend === "up";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "9px",
        marginRight: "5px",
        color: up ? "var(--cr-up)" : "var(--cr-down)",
        transform: up ? "none" : "rotate(180deg)",
      }}
    >
      ▲
    </span>
  );
}

export function MarketTicker({ items, speed = 40 }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const doubled = [...items, ...items];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

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
    <div className="market-ticker">
      <div className="market-ticker-fade market-ticker-fade-left" />
      <div className="market-ticker-fade market-ticker-fade-right" />

      <div ref={trackRef} className="market-ticker-track">
        {doubled.map((item, i) => (
          <span key={i} className="market-ticker-item">
            <TrendIndicator trend={item.trend ?? "neutral"} />
            <span
              style={{
                fontSize: "14px", fontWeight: 700, color: "#B5651D",
                letterSpacing: "0.01em", fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {item.value}
            </span>
            <span
              style={{
                fontSize: "12px", fontWeight: 400, color: "#6B6056",
                textTransform: "uppercase", letterSpacing: "0.06em",
                fontFamily: "'DM Sans', sans-serif", marginLeft: "8px",
              }}
            >
              {item.label}
            </span>
            <span className="market-ticker-dot" />
          </span>
        ))}
      </div>
    </div>
  );
}
