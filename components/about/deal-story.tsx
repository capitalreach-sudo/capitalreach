"use client";

import { useReveal } from "@/hooks/useReveal";
import { useTranslation } from "@/hooks/useTranslation";
import { WaxSeal } from "@/components/ui/WaxSeal";

/**
 * How a round closes, told as a scroll story: five movements down one
 * ledger line, each revealing as it enters the viewport (the same reveal
 * mechanic the rest of the site uses -- instant under reduced motion).
 * The last movement is sealed.
 */
export function DealStory() {
  const { t } = useTranslation();
  const ref = useReveal();
  const steps = [1, 2, 3, 4, 5].map((n) => ({
    label: t(`pipeline.s${n}t`),
    line: t(`pipeline.s${n}d`),
  }));
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="reveal" aria-label={t("pipeline.title")}
      style={{ background: "var(--cr-paper)", borderTop: "1px solid var(--cr-rule)" }}>
      <div className="max-w-[760px] mx-auto px-6 md:px-10 py-16 md:py-24">
        <div className="ruled-label" style={{ marginBottom: "48px" }}>{t("pipeline.title")}</div>
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {steps.map((step, i) => {
            const last = i === steps.length - 1;
            return (
              <li key={step.label} className="reveal-child" style={{ display: "flex", gap: "24px", position: "relative", paddingBottom: last ? 0 : "44px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: "40px" }}>
                  {last ? (
                    <WaxSeal size={40} />
                  ) : (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", border: "1px solid var(--cr-copper-br)", background: "var(--cr-copper-bg)", borderRadius: "999px", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                  {!last && <span aria-hidden style={{ flex: 1, width: 1, background: "var(--cr-rule)", marginTop: 8 }} />}
                </div>
                <div style={{ paddingTop: last ? 8 : 5 }}>
                  <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(19px, 2.4vw, 24px)", color: "var(--cr-ink)", letterSpacing: "-0.01em", marginBottom: "6px" }}>
                    {step.label}
                  </h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.65, maxWidth: "52ch" }}>
                    {step.line}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
