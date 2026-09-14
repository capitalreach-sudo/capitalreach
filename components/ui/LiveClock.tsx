"use client";

import { useEffect, useState } from "react";

interface Props {
  timezone?: string; // e.g. "America/New_York"
  label?: string;    // e.g. "New York"
  className?: string;
}

export function LiveClock({ timezone, label, className = "" }: Props) {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const format = () => {
      const opts: Intl.DateTimeFormatOptions = {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        ...(timezone ? { timeZone: timezone } : {}),
      };
      return new Date().toLocaleTimeString(undefined, opts);
    };

    setTime(format());
    const id = setInterval(() => setTime(format()), 1000);
    return () => clearInterval(id);
  }, [timezone]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {/* The one caps voice: 11px/500/0.08em on ink-3. */}
      {label && (
        <span style={{
          fontSize: "11px", fontWeight: 500, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--cr-ink-3)",
          marginRight: "8px", fontFamily: "'DM Sans', sans-serif",
        }}>
          {label}
        </span>
      )}
      <span style={{
        fontFamily: "'DM Mono', 'DM Sans', monospace",
        fontSize: "inherit",
        color: "inherit",
        letterSpacing: "0.04em",
      }}>
        {time || "——:——:——"}
      </span>
    </span>
  );
}
