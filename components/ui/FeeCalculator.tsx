"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { formatMoney, DEFAULT_CURRENCY } from "@/lib/currency";
import { SUCCESS_FEE_PERCENT } from "@/lib/circumvention-text";

const BROKER_PERCENT = 6;

interface Props {
  /** Starting amount in the input (raise amount or check size). */
  defaultAmount?: number;
  /** ISO code used for formatting; defaults to EUR-first pricing copy. */
  currency?: string;
  /**
   * "raise" (default): founder framing — 2% vs 6% broker, you save 4%.
   * "check": investor framing — your portion of the 2% on your check size.
   * "compact": raise framing without the label / helper text (for sidebars).
   */
  variant?: "raise" | "check" | "compact";
  /** Controlled mode: pass amount + onChange to drive from a parent form. */
  amount?: number | null;
  onChange?: (amount: number | null) => void;
  className?: string;
}

/**
 * The 2% calculator (Phase 1, mechanism D). Reframes the success fee as the
 * cheap option: next to a 6% broker and five-figure legal costs, 2% at close
 * reads as small. Pure client math; no network.
 */
export function FeeCalculator({ defaultAmount = 500_000, currency = "EUR", variant = "raise", amount: controlled, onChange, className }: Props) {
  const { t } = useTranslation();
  const [internal, setInternal] = useState<string>(defaultAmount ? String(defaultAmount) : "");
  const isControlled = controlled !== undefined && onChange !== undefined;
  const raw = isControlled ? (controlled == null ? "" : String(controlled)) : internal;

  const amount = useMemo(() => {
    const n = Number(String(raw).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 && n <= 9_999_999_999 ? n : 0;
  }, [raw]);

  function setAmount(v: string) {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (isControlled) {
      const n = Number(cleaned);
      onChange!(cleaned === "" || !Number.isFinite(n) ? null : n);
    } else {
      setInternal(cleaned);
    }
  }

  const cur = currency || DEFAULT_CURRENCY;
  const fee = amount * (SUCCESS_FEE_PERCENT / 100);
  const broker = amount * (BROKER_PERCENT / 100);
  const saved = broker - fee;
  const fmt = (n: number) => (n > 0 ? formatMoney(n, cur) : "—");

  const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" };
  const rowStyle: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--cr-rule)" };
  const labelStyle: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px", color: "var(--cr-ink-3)" };

  return (
    <div className={className} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", padding: variant === "compact" ? "14px 16px" : "20px 22px" }}>
      {variant !== "compact" && (
        <div className="ruled-label" style={{ marginBottom: "12px" }}>
          {variant === "check" ? t("feeCalc.titleCheck") : t("feeCalc.title")}
        </div>
      )}

      <label style={{ display: "block" }}>
        <span style={{ ...labelStyle, display: "block", marginBottom: "6px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
          {variant === "check" ? t("feeCalc.inputCheck") : t("feeCalc.inputRaise")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "0 12px" }}>
          <span style={{ ...mono, fontSize: "13px", color: "var(--cr-ink-4)" }}>{cur}</span>
          <input
            inputMode="numeric"
            value={raw ? Number(String(raw).replace(/[^0-9.]/g, "")).toLocaleString("en-US") : ""}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500,000"
            aria-label={variant === "check" ? t("feeCalc.inputCheck") : t("feeCalc.inputRaise")}
            style={{ ...mono, flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", height: "42px", fontSize: "16px", color: "var(--cr-ink)" }}
          />
        </div>
      </label>

      <div style={{ marginTop: "12px" }}>
        {variant === "check" ? (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>{t("feeCalc.yourPortion", { fee: SUCCESS_FEE_PERCENT })}</span>
              <span style={{ ...mono, fontWeight: 600, fontSize: "16px", color: "var(--cr-copper)" }}>{fmt(fee)}</span>
            </div>
            <div style={{ ...rowStyle, borderBottom: "none" }}>
              <span style={labelStyle}>{t("feeCalc.investorPays")}</span>
              <span style={{ ...mono, fontWeight: 600, fontSize: "14px", color: "var(--cr-up)" }}>{formatMoney(0, cur)}</span>
            </div>
          </>
        ) : (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>{t("feeCalc.rowCapitalReach", { fee: SUCCESS_FEE_PERCENT })}</span>
              <span style={{ ...mono, fontWeight: 600, fontSize: "16px", color: "var(--cr-copper)" }}>{fmt(fee)}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>{t("feeCalc.rowBroker", { fee: BROKER_PERCENT })}</span>
              <span style={{ ...mono, fontWeight: 500, fontSize: "14px", color: "var(--cr-ink-4)", textDecoration: "line-through" }}>{fmt(broker)}</span>
            </div>
            <div style={{ ...rowStyle, borderBottom: "none" }}>
              <span style={{ ...labelStyle, fontWeight: 500, color: "var(--cr-ink-2)" }}>{t("feeCalc.rowSave")}</span>
              <span style={{ ...mono, fontWeight: 600, fontSize: "15px", color: "var(--cr-up)" }}>{fmt(saved)}</span>
            </div>
          </>
        )}
      </div>

      {variant === "raise" && (
        <p style={{ ...labelStyle, fontSize: "11px", marginTop: "10px", lineHeight: 1.5 }}>
          {t("feeCalc.footnote")}
        </p>
      )}
    </div>
  );
}
