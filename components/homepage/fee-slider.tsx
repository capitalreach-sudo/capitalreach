"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The 2% made tangible: drag the raise, watch the fee -- and watch what a
 * traditional 6% broker would have taken from the same round. Pure client
 * math over the pricing the proof strip already states; the slider just lets
 * a founder feel it with their own number. Reuses the feeCalc locale keys the
 * listing calculator shipped with (all fifteen languages, day one).
 */
const STEPS = [100_000, 250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 7_500_000, 10_000_000];

function money(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `$${Math.round(n / 1000)}k`;
}

export function FeeSlider() {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(4); // $1M default
  const raise = STEPS[idx];
  const ours = raise * 0.02;
  const broker = raise * 0.06;

  return (
    <section aria-label={t("feeCalc.title")} style={{ background: "var(--cr-band-bg)", borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)" }}>
      <div className="max-w-[880px] mx-auto px-6 md:px-10 py-12 md:py-16">
        <div className="ruled-label" style={{ marginBottom: "20px" }}>{t("feeCalc.title")}</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "8px" }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-band-ink-dim)" }}>
            {t("feeCalc.inputRaise")}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "28px", color: "var(--cr-band-ink)", fontVariantNumeric: "tabular-nums" }}>
            {money(raise)}
          </span>
        </div>
        <input
          type="range" min={0} max={STEPS.length - 1} step={1} value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-label={t("feeCalc.inputRaise")}
          className="cr-range"
          style={{ "--fill": `${(idx / (STEPS.length - 1)) * 100}%` } as React.CSSProperties}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1px", background: "color-mix(in srgb, var(--cr-band-ink) 10%, transparent)", marginTop: "20px", border: "1px solid color-mix(in srgb, var(--cr-band-ink) 10%, transparent)", borderRadius: "4px", overflow: "hidden" }}>
          {[
            [t("feeCalc.rowCapitalReach", { fee: 2 }), money(ours), "var(--cr-copper)"],
            [t("feeCalc.rowBroker", { fee: 6 }), money(broker), "var(--cr-band-ink-dim)"],
            [t("feeCalc.rowSave"), money(broker - ours), "var(--cr-up)"],
          ].map(([label, value, color]) => (
            <div key={label as string} style={{ background: "var(--cr-band-bg)", padding: "14px 16px" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "20px", color: color as string, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-band-ink-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "6px" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
