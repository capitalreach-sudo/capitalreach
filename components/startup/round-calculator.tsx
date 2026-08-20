"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * "If I invest X, what do I own?" — answered while the thumb is still moving.
 *
 * Pure arithmetic over the post-money the listing already displays; no new
 * claims about the company, no server round-trips. The maths is the same
 * ownershipForCheque derivation as lib/round-math, inlined for the one case
 * a slider needs (a fixed, known post-money), so the number here can never
 * disagree with the cells above it.
 *
 * Every figure is labelled as implied by the founder's own valuation — the
 * calculator explains the terms on the page, it does not appraise them.
 */
export function RoundCalculator({ postMoney, currency, minCheck, fundingTarget }: {
  postMoney: number;
  currency: string | null;
  minCheck: number | null;
  fundingTarget: number | null;
}) {
  const { t } = useTranslation();
  const floor = Math.max(1000, minCheck ?? 10_000);
  const ceil = Math.max(floor * 2, Math.min(fundingTarget ?? postMoney * 0.2, postMoney));
  const [cheque, setCheque] = useState(Math.min(Math.max(floor, Math.round((fundingTarget ?? floor * 10) / 10)), ceil));

  if (!Number.isFinite(postMoney) || postMoney <= 0) return null;

  const pct = (cheque / postMoney) * 100;

  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: 4, padding: "14px 16px", marginTop: 10 }}>
      <p style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)", marginBottom: 10 }}>
        <Calculator style={{ width: 12, height: 12, color: "var(--cr-copper)" }} />
        {t("calc.title")}
      </p>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 20, color: "var(--cr-ink)" }}>
          {formatMoney(cheque, currency, { compact: true })}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 20, color: "var(--cr-copper)" }}>
          {pct < 0.01 ? "<0.01" : pct.toFixed(2)}%
        </span>
      </div>

      <input
        type="range"
        min={floor}
        max={ceil}
        step={Math.max(500, Math.round((ceil - floor) / 200))}
        value={cheque}
        onChange={e => setCheque(Number(e.target.value))}
        aria-label={t("calc.title")}
        style={{ width: "100%", accentColor: "var(--cr-copper)" }}
      />

      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: "var(--cr-ink-4)", marginTop: 8, lineHeight: 1.5 }}>
        {t("calc.note", { post: formatMoney(postMoney, currency, { compact: true }) ?? "—" })}
      </p>
    </div>
  );
}
