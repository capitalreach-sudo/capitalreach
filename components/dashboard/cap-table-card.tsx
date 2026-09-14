"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { Ledger, LedgerCell, LedgerHead, LedgerRow } from "@/components/ui/ledger";

/**
 * The cap table: closed rounds as a ledger (who, how much, what percent, at
 * what valuation, when), plus the running total of equity ceded through the
 * platform. Renders nothing until a close exists; an empty cap table is not
 * a feature, so this component is its own data gate.
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

  const dateStyle: React.CSSProperties = {
    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
    fontSize: "0.8125rem",
    lineHeight: 1.4,
    color: "var(--cr-ink-3)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };

  return (
    <div className="sd-group">
      <div className="sd-group__head">
        <h3 className="sd-group__title">{t("capTable.title")}</h3>
        {data.totalPct > 0 && (
          <span style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: "0.8125rem",
            lineHeight: 1.4,
            color: "var(--cr-ink-3)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {t("capTable.total", { pct: data.totalPct.toFixed(2) })}
          </span>
        )}
      </div>
      <Ledger
        columns="minmax(0,1fr) auto auto auto"
        head={
          <LedgerHead>
            <LedgerCell>{t("capTable.investor")}</LedgerCell>
            <LedgerCell figure>{t("capTable.amount")}</LedgerCell>
            <LedgerCell figure>{t("capTable.ownership")}</LedgerCell>
            <LedgerCell align="end">{t("capTable.date")}</LedgerCell>
          </LedgerHead>
        }
      >
        {data.rows.map(r => (
          <LedgerRow key={r.id}>
            <LedgerCell primary>
              <span className="cr-row-title">{r.investor ?? t("capTable.unknown")}</span>
              {r.valuationAtClose != null && money(r.valuationAtClose, r.currency, true) && (
                <span className="cr-row-sub">
                  {t("capTable.valuation")}: {money(r.valuationAtClose, r.currency, true)}
                </span>
              )}
            </LedgerCell>
            <LedgerCell figure>{r.amount ? money(r.amount, r.currency) : null}</LedgerCell>
            <LedgerCell figure>{r.ownershipPercent != null ? `${r.ownershipPercent.toFixed(2)}%` : null}</LedgerCell>
            <LedgerCell align="end">
              {r.closedAt ? <span style={dateStyle}>{formatDate(r.closedAt)}</span> : null}
            </LedgerCell>
          </LedgerRow>
        ))}
      </Ledger>
      <p className="cr-footnote">{t("capTable.note")}</p>
    </div>
  );
}
