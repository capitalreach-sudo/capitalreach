"use client";

import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { StartupCard, type StartupCardData } from "@/components/startup/startup-card";

/**
 * Hero + proof strip. Client only for translation hydration -- there is no
 * state here, no observers, no JS animation: entrances are the CSS fadeUp
 * classes, so the headline can never render as concatenated words the way
 * the old per-word JS reveal could.
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
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section
        style={{
          minHeight: "calc(100svh - 56px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "96px 24px 64px",
        }}
      >
        {launch.isLaunch && (
          <div
            className="animate-fade-up"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(181,101,29,0.08)",
              border: "1px solid rgba(181,101,29,0.2)",
              borderRadius: "999px",
              padding: "6px 16px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              fontSize: "12px",
              color: "var(--cr-copper)",
            }}
          >
            ✦ {t("hero.launchPill", { count: launch.memberCount, target: launch.target })}
          </div>
        )}

        <h1
          className="animate-fade-up-1"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            fontSize: "clamp(44px, 6.5vw, 76px)",
            lineHeight: 0.98,
            letterSpacing: "-0.02em",
            color: "var(--cr-ink)",
            textAlign: "center",
            marginTop: "32px",
            maxWidth: "900px",
          }}
        >
          {t("hero.headline1")}{" "}
          <br />
          {t("hero.headline2")} {t("hero.headline3")}
        </h1>

        <p
          className="animate-fade-up-2"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize: "18px",
            color: "var(--cr-ink-3)",
            textAlign: "center",
            marginTop: "20px",
            maxWidth: "460px",
            lineHeight: 1.6,
          }}
        >
          {t("hero.oneLiner")}
        </p>

        <div className="animate-fade-up-3" style={{ display: "flex", gap: "12px", marginTop: "36px", flexWrap: "wrap", justifyContent: "center" }}>
          <Link
            href="/auth/signup?role=startup"
            style={{
              background: "var(--cr-copper)",
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              fontSize: "14px",
              borderRadius: "999px",
              padding: "14px 28px",
              textDecoration: "none",
              minHeight: "44px",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {t("hero.ctaPrimary")}
          </Link>
          <Link
            href="/startups"
            style={{
              border: "1px solid var(--cr-paper-4)",
              color: "var(--cr-ink-2)",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 400,
              fontSize: "14px",
              borderRadius: "999px",
              padding: "14px 28px",
              textDecoration: "none",
              minHeight: "44px",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {t("hero.ctaBrowse")}
          </Link>
        </div>

        <div
          className="animate-fade-up-4"
          style={{ display: "flex", alignItems: "center", gap: "24px", justifyContent: "center", flexWrap: "wrap", marginTop: "26px" }}
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
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--cr-copper)" }} />
              {item}
            </span>
          ))}
        </div>

        {hero && (
          <div className="animate-fade-up-4" style={{ marginTop: "56px", width: "100%", maxWidth: "440px" }}>
            <StartupCard startup={hero} investorTier={null} />
          </div>
        )}
      </section>

      {/* ── Proof strip: product facts, never database counts ─────────── */}
      <section
        style={{
          background: "var(--cr-ink)",
          borderTop: "1px solid rgba(181,101,29,0.15)",
          borderBottom: "1px solid rgba(181,101,29,0.15)",
          padding: "20px 24px",
        }}
      >
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexWrap: "wrap" }}>
          {[
            { n: "2%", label: t("hero.proofFee") },
            { n: "€0", label: t("hero.proofUpfront") },
            { n: "100%", label: t("hero.proofVetted") },
          ].map((s, i) => (
            <div
              key={s.n}
              style={{
                flex: "1 1 160px",
                textAlign: "center",
                padding: "8px 32px",
                borderLeft: i > 0 ? "1px solid rgba(245,240,232,0.12)" : "none",
              }}
            >
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "28px", color: "var(--cr-copper)" }}>{s.n}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "rgba(245,240,232,0.5)", marginTop: "4px" }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
