"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface UpgradePromptProps {
  message:    string;
  ctaLabel?:  string;
  ctaHref?:   string;
}

export function UpgradePrompt({
  message,
  ctaLabel = "Upgrade",
  ctaHref  = "/pricing",
}: UpgradePromptProps) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
        background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)",
        borderRadius: "4px", padding: "12px 16px",
      }}
    >
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)", lineHeight: 1.5 }}>
        {message}
      </p>
      <Link
        href={ctaHref}
        style={{
          display: "inline-flex", alignItems: "center", gap: "4px", flexShrink: 0,
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
          color: "var(--cr-copper)", textDecoration: "none", whiteSpace: "nowrap",
        }}
      >
        {ctaLabel} <ArrowUpRight style={{ width: 13, height: 13 }} />
      </Link>
    </div>
  );
}
