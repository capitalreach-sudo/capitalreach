"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { safeFormatMRR } from "@/lib/validators";

/**
 * The traction curve: monthly snapshots as bars.
 *
 * MRR is charted when any month has it; otherwise users — a pre-revenue
 * company's curve is its user growth, and an empty revenue chart would say
 * "no traction" when the honest reading is "different traction". Bars, not a
 * line: with 3–12 monthly points a line invents slopes between measurements;
 * bars claim exactly what was recorded and nothing between.
 */
export type MetricPoint = {
  month: string;
  mrr: number | null;
  arr: number | null;
  user_count: number | null;
  paying_customers: number | null;
};

export function TractionChart({ points }: { points: MetricPoint[] }) {
  const { t } = useTranslation();
  if (points.length < 2) return null; // one bar is a number, not a curve

  const useMrr = points.some((p) => (p.mrr ?? 0) > 0);
  const value = (p: MetricPoint) => (useMrr ? p.mrr ?? 0 : p.user_count ?? 0);
  const max = Math.max(...points.map(value), 1);
  const fmt = (n: number) => (useMrr ? safeFormatMRR(n) : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

  return (
    <div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
        {useMrr ? t("traction.mrrTitle") : t("traction.usersTitle")}
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "110px" }}>
        {points.map((p) => {
          const v = value(p);
          const h = Math.max((v / max) * 100, v > 0 ? 4 : 1);
          const monthLabel = p.month.slice(2, 7).replace("-", "/");
          return (
            <div key={p.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", minWidth: 0 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "var(--cr-ink-3)", whiteSpace: "nowrap" }}>
                {v > 0 ? fmt(v) : "—"}
              </span>
              <div
                title={`${monthLabel}: ${v > 0 ? fmt(v) : "—"}`}
                style={{ width: "100%", maxWidth: "42px", height: `${h}%`, minHeight: "2px", background: v > 0 ? "var(--cr-copper)" : "var(--cr-paper-4)", borderRadius: "2px 2px 0 0", opacity: v > 0 ? 0.9 : 1 }}
              />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                {monthLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
