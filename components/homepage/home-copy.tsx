"use client";

import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { StartupCard, type StartupCardData } from "@/components/startup/startup-card";

/**
 * Hero + proof strip.
 *
 * Design intent: an editorial front page, not a SaaS landing page. What earns
 * attention here is confidence -- one enormous serif statement with the payoff
 * in copper italic, a single sentence under it, and one real listing as proof
 * that the marketplace is not empty. No carousel, no ticker, no gradient mesh:
 * this is a finance product, and restraint reads as competence.
 *
 * All motion is the CSS fadeUp classes -- no JS animation, so the headline
 * cannot fail into concatenated words the way the old per-word reveal did.
 */
export function HomeCopy({
  launch,
  hero,
}: {
  launch: { isLaunch: boolean; memberCount: number; target: number };
  hero: StartupCardData | null;
}) {
  const { t } = useTranslation();

  return (
    <main style={{ background: "var(--cr-paper)" }}>
      {/* ── Hero ─────────────────────────────────────────────────────────
          A hairline grid behind the fold: barely visible, but it gives the
          paper a ledger's texture and stops the large type floating in void.
          Pure CSS gradients -- nothing to paint on scroll. */}
      <section
        style={{
          position: "relative",
          minHeight: "calc(100svh - 56px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "clamp(56px, 9vh, 104px) 24px 72px",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(26,22,18,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(26,22,18,0.035) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse 90% 60% at 50% 32%, #000 25%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 32%, #000 25%, transparent 78%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
          {/* Eyebrow: rule — label — rule. The house device, used once. */}
          <div className="animate-fade-up" style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "clamp(20px, 4vh, 36px)" }}>
            <span style={{ width: "clamp(24px, 6vw, 56px)", height: "1px", background: "var(--cr-copper-br)" }} />
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                fontSize: "11px",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "var(--cr-copper)",
                whiteSpace: "nowrap",
              }}
            >
              {launch.isLaunch
                ? t("hero.launchPill", { count: launch.memberCount, target: launch.target })
                : t("hero.eyebrow")}
            </span>
            <span style={{ width: "clamp(24px, 6vw, 56px)", height: "1px", background: "var(--cr-copper-br)" }} />
          </div>

          <h1
            className="animate-fade-up-1"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 700,
              fontSize: "clamp(46px, 8vw, 92px)",
              lineHeight: 0.94,
              letterSpacing: "-0.028em",
              color: "var(--cr-ink)",
              textAlign: "center",
              // Sized to the longest line ("meets vetted ventures.") so the
              // only break is the deliberate one, not an accident of width.
              maxWidth: "min(94vw, 23ch)",
              textWrap: "balance",
            }}
          >
            {t("hero.headline1")}{" "}
            <br />
            <span style={{ fontStyle: "italic", color: "var(--cr-copper)" }}>
              {t("hero.headline2")} {t("hero.headline3")}
            </span>
          </h1>

          <p
            className="animate-fade-up-2"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: "clamp(16px, 1.4vw, 19px)",
              color: "var(--cr-ink-3)",
              textAlign: "center",
              marginTop: "clamp(18px, 3vh, 28px)",
              maxWidth: "48ch",
              lineHeight: 1.62,
            }}
          >
            {t("hero.oneLiner")}
          </p>

          <div
            className="animate-fade-up-3"
            style={{ display: "flex", gap: "12px", marginTop: "clamp(28px, 4.5vh, 44px)", flexWrap: "wrap", justifyContent: "center" }}
          >
            <Link href="/auth/signup?role=startup" className="cr-cta cr-cta-primary">
              {t("hero.ctaPrimary")}
            </Link>
            <Link href="/startups" className="cr-cta cr-cta-ghost">
              {t("hero.ctaBrowse")}
            </Link>
          </div>

          <div
            className="animate-fade-up-4"
            style={{ display: "flex", alignItems: "center", gap: "clamp(14px, 3vw, 28px)", justifyContent: "center", flexWrap: "wrap", marginTop: "clamp(20px, 3vh, 30px)" }}
          >
            {[t("hero.trustVetted"), t("hero.trustFee"), t("hero.trustLaunch")].map((item) => (
              <span
                key={item}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 300,
                  fontSize: "12px",
                  color: "var(--cr-ink-4)",
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--cr-copper)", flexShrink: 0 }} />
                {item}
              </span>
            ))}
          </div>

          {/* One real listing, labelled. Proof beats a screenshot mock: this
              card is the same component the directory renders. */}
          {hero && (
            <div className="animate-fade-up-4" style={{ marginTop: "clamp(36px, 6vh, 64px)", width: "100%", maxWidth: "430px" }}>
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500,
                  fontSize: "10px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--cr-ink-4)",
                  textAlign: "center",
                  marginBottom: "12px",
                }}
              >
                {t("hero.liveNow")}
              </p>
              <StartupCard startup={hero} investorTier={null} />
            </div>
          )}
        </div>
      </section>

      {/* ── Proof strip: product facts, never database counts ───────────── */}
      <section
        style={{
          background: "var(--cr-ink)",
          borderTop: "1px solid rgba(181,101,29,0.2)",
          borderBottom: "1px solid rgba(181,101,29,0.2)",
          padding: "clamp(24px, 4vw, 36px) 24px",
        }}
      >
        <div style={{ maxWidth: "960px", margin: "0 auto", display: "flex", flexWrap: "wrap" }}>
          {[
            { n: "2%", label: t("hero.proofFee") },
            { n: "€0", label: t("hero.proofUpfront") },
            { n: "100%", label: t("hero.proofVetted") },
          ].map((s, i) => (
            <div
              key={s.n}
              style={{
                flex: "1 1 170px",
                textAlign: "center",
                padding: "10px 24px",
                borderLeft: i > 0 ? "1px solid rgba(245,240,232,0.12)" : "none",
              }}
            >
              <p
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  fontSize: "clamp(28px, 3.4vw, 38px)",
                  color: "var(--cr-copper)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {s.n}
              </p>
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 300,
                  fontSize: "12px",
                  color: "rgba(245,240,232,0.55)",
                  marginTop: "8px",
                  letterSpacing: "0.02em",
                }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
