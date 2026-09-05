"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CountUp } from "@/components/ui/count-up";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * "Who's waiting for you": pick a stage and a sector, watch the live count of
 * investors with declared appetite for exactly that round. The number is real
 * (the same aggregate the directory's filters expose), it moves as you play,
 * and the only way to meet them is the CTA -- the homepage's most honest
 * sales pitch, because the product itself is making it.
 */
const STAGES = [
  { value: "pre-seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b_plus", label: "Series B+" },
];
const INDUSTRIES = ["B2B SaaS", "FinTech", "HealthTech", "AI / Machine Learning", "Consumer", "Marketplace"];

const CHIP: React.CSSProperties = {
  border: "1px solid var(--cr-rule-dark)", background: "transparent", borderRadius: "999px",
  padding: "8px 16px", minHeight: "40px", cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)",
};
const CHIP_ON: React.CSSProperties = {
  ...CHIP, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)",
};

export function MarketMatcher() {
  const { t } = useTranslation();
  const [stage, setStage] = useState("seed");
  const [industry, setIndustry] = useState("B2B SaaS");
  const [result, setResult] = useState<{ count: number; total: number } | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/market/match?stage=${encodeURIComponent(stage)}&industry=${encodeURIComponent(industry)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setResult(d); })
      .catch(() => {});
    return () => ctl.abort();
  }, [stage, industry]);

  if (result === null) return null; // renders only once the first count lands

  return (
    <section aria-label={t("match.title")} style={{ background: "var(--cr-paper)", borderTop: "1px solid var(--cr-rule)" }}>
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-16 md:py-24 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("match.title")}</div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(22px, 3vw, 28px)", color: "var(--cr-ink)", letterSpacing: "-0.01em", marginBottom: "8px" }}>
            {t("match.hint")}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "20px" }}>
            {STAGES.map((s) => (
              <button key={s.value} onClick={() => setStage(s.value)} aria-pressed={stage === s.value}
                style={stage === s.value ? CHIP_ON : CHIP}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
            {INDUSTRIES.map((ind) => (
              <button key={ind} onClick={() => setIndustry(ind)} aria-pressed={industry === ind}
                style={industry === ind ? CHIP_ON : CHIP}>
                {ind}
              </button>
            ))}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "clamp(64px, 10vw, 110px)", color: "var(--cr-copper)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            <CountUp value={result.count} />
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", marginTop: "12px" }}>
            {t("match.result", { total: result.total })}
          </p>
          <Link href="/auth/signup?role=startup"
            className="btn-copper-shimmer"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", padding: "12px 28px", borderRadius: "999px", marginTop: "20px" }}>
            {t("cta.listStartup")}
          </Link>
        </div>
      </div>
    </section>
  );
}
