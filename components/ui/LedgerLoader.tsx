"use client";

import { useTranslation } from "@/hooks/useTranslation";

/**
 * A ledger being written: three rules, a copper square that TICKS along
 * them (steps timing, never a glide). Replaces every loading string on the
 * site -- "Loading..." as text is retired.
 */
export function LedgerLoader({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "24px" }}>
      <div style={{ position: "relative", width: "96px", height: "34px" }}>
        {[0, 14, 28].map((y) => (
          <div key={y} style={{ position: "absolute", top: y + 2, left: 0, right: 0, height: "1px", background: "var(--cr-paper-4)" }} />
        ))}
        <div style={{
          position: "absolute", top: 0, left: 0, width: "6px", height: "6px",
          background: "var(--cr-copper)",
          animation: "ledgerTick 1.2s steps(24) infinite",
        }} />
      </div>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--cr-ink-4)" }}>
        {label ?? t("common.loading")}
      </span>
    </div>
  );
}
