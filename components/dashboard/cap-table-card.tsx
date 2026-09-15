"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The cap table: closed rounds as a ledger (who, how much, what percent, at
 * what valuation, when), plus the running total of equity ceded through the
 * platform. Renders nothing until a close exists; an empty cap table is not
 * a feature, so this component is its own data gate.
 *
 * Plain table, matching the signature-roster table on this same dashboard
 * (components/dashboard/startup-dashboard-client.tsx) rather than Ledger, the
 * Apple Design component system the dashboard itself was reverted away from.
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

  // formatMoney answers a dash for an implausible amount; a figure column
  // shows nothing rather than a bare dash.
  const money = (amount: number, currency: string | null, compact = false) => {
    const out = formatMoney(amount, currency, { compact });
    return out === "—" ? null : out;
  };

  // Dense rows get air, never fewer columns: 12px top and bottom is the row
  // rhythm inside a table block on this surface.
  const cell: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-2)", padding: "12px 16px 12px 0", borderBottom: "1px solid var(--cr-rule)" };
  const head: React.CSSProperties = { ...cell, padding: "0 16px 8px 0", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-3)", textAlign: "left", whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
        <h3 className="ruled-label" data-cr-visible="1">{t("capTable.title")}</h3>
        {data.totalPct > 0 && (
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-3)", fontVariantNumeric: "tabular-nums" }}>
            {t("capTable.total", { pct: data.totalPct.toFixed(2) })}
          </span>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={head}>{t("capTable.investor")}</th>
              <th style={{ ...head, textAlign: "right" }}>{t("capTable.amount")}</th>
              <th style={{ ...head, textAlign: "right" }}>{t("capTable.ownership")}</th>
              <th style={{ ...head, textAlign: "right" }}>{t("capTable.date")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td style={cell}>
                  <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "14px", color: "var(--cr-ink)" }}>
                    {r.investor ?? t("capTable.unknown")}
                  </span>
                  {r.valuationAtClose != null && money(r.valuationAtClose, r.currency, true) && (
                    <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px" }}>
                      {t("capTable.valuation")}: {money(r.valuationAtClose, r.currency, true)}
                    </span>
                  )}
                </td>
                <td style={{ ...cell, fontFamily: "'JetBrains Mono', monospace", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {r.amount ? money(r.amount, r.currency) : null}
                </td>
                <td style={{ ...cell, fontFamily: "'JetBrains Mono', monospace", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {r.ownershipPercent != null ? `${r.ownershipPercent.toFixed(2)}%` : null}
                </td>
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {r.closedAt ? formatDate(r.closedAt) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "16px" }}>
        {t("capTable.note")}
      </p>
    </div>
  );
}
