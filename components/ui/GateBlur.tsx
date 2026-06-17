"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

interface GateBlurProps {
  title:       string;
  description: string;
  ctaLabel?:   string;
  ctaHref?:    string;
  children:    React.ReactNode;
}

export function GateBlur({
  title,
  description,
  ctaLabel = "View plans",
  ctaHref  = "/pricing",
  children,
}: GateBlurProps) {
  return (
    <div style={{ position: "relative", borderRadius: "4px", overflow: "hidden" }}>
      <div
        aria-hidden
        style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none" }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, var(--cr-paper) 35%, rgba(245,240,232,0.55))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Lock style={{ width: 15, height: 15, color: "var(--cr-copper)" }} />
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>
          {title}
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6, maxWidth: "320px" }}>
          {description}
        </p>
        <Link
          href={ctaHref}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "var(--cr-copper)", color: "#fff",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
            padding: "9px 20px", borderRadius: "4px", textDecoration: "none",
          }}
        >
          {ctaLabel} →
        </Link>
      </div>
    </div>
  );
}
