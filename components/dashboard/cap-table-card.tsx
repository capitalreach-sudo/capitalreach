"use client";

import { useEffect, useState } from "react";
import { PieChart } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The cap-table card: closed rounds as a ledger — who, how much, what
 * percent, at what valuation, when — plus the running total of equity
 * ceded through the platform. Renders nothing until a close exists;
 * an empty cap table is not a feature.
 */
type Row = {
  id: string; investor: string | null; amount: number | null; currency: string | null;
  ownershipPercent: number | null; valuationAtClose: number | null; closedAt: string | null;
};

export function CapTableCard() {
  const { t } = useTranslation();
  const [data, setData] = useState<{ rows: Row[]; totalPct: number } | null>(null);

  useEffect(() => {
    fetch("/api/deals/captable")
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data || data.rows.length === 0) return null;

  return (
    <section className="border border-cr-p4 rounded-xl p-5 mb-6" style={{ background: "var(--cr-paper-2)" }}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-semibold text-cr-ink inline-flex items-center gap-2 text-sm">
          <PieChart className="h-4 w-4 text-cr-copper" /> {t("capTable.title")}
        </h2>
        {data.totalPct > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: "var(--cr-copper)" }}>
            {t("capTable.total", { pct: data.totalPct.toFixed(2) })}
          </span>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["investor", "amount", "ownership", "valuation", "date"].map(h => (
                <th key={h} style={{ textAlign: "start", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)", padding: "6px 12px 6px 0", borderBottom: "1px solid var(--cr-rule-dark)" }}>
                  {t(`capTable.${h}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.id}>
                <td style={{ padding: "8px 12px 8px 0", borderBottom: "1px solid var(--cr-rule)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, color: "var(--cr-ink)" }}>{r.investor ?? t("capTable.unknown")}</td>
                <td style={{ padding: "8px 12px 8px 0", borderBottom: "1px solid var(--cr-rule)", fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: "var(--cr-ink-2)" }}>{r.amount ? formatMoney(r.amount, r.currency) : "—"}</td>
                <td style={{ padding: "8px 12px 8px 0", borderBottom: "1px solid var(--cr-rule)", fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: "var(--cr-copper)", fontWeight: 700 }}>{r.ownershipPercent != null ? `${r.ownershipPercent.toFixed(2)}%` : "—"}</td>
                <td style={{ padding: "8px 12px 8px 0", borderBottom: "1px solid var(--cr-rule)", fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: "var(--cr-ink-3)" }}>{r.valuationAtClose ? formatMoney(r.valuationAtClose, r.currency, { compact: true }) : "—"}</td>
                <td style={{ padding: "8px 12px 8px 0", borderBottom: "1px solid var(--cr-rule)", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 12, color: "var(--cr-ink-4)" }}>{r.closedAt ? formatDate(r.closedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 11, color: "var(--cr-ink-4)", marginTop: 10, lineHeight: 1.5 }}>
        {t("capTable.note")}
      </p>
    </section>
  );
}
