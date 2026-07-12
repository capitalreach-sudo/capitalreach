"use client";

import { Printer } from "lucide-react";

interface Props {
  label?: string;
}

export function PrintButton({ label = "Export PDF" }: Props) {
  return (
    <button
      onClick={() => window.print()}
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          "6px",
        padding:      "8px 14px",
        background:   "var(--cr-paper-2)",
        border:       "1px solid var(--cr-rule-dark)",
        borderRadius: "4px",
        fontFamily:   "'DM Sans', sans-serif",
        fontWeight:   400,
        fontSize:     "13px",
        color:        "var(--cr-ink-3)",
        cursor:       "pointer",
        transition:   "all 150ms ease",
        lineHeight:   1,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "var(--cr-paper-3)";
        el.style.color = "var(--cr-ink)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "var(--cr-paper-2)";
        el.style.color = "var(--cr-ink-3)";
      }}
    >
      <Printer style={{ width: 14, height: 14 }} />
      {label}
    </button>
  );
}
