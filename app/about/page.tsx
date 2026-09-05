import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DealStory } from "@/components/about/deal-story";
import { Target, Zap, Shield, Heart } from "lucide-react";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { Metadata } from "next";

// The whole body is rendered on the SERVER with getTranslator(getLocale()),
// and the locale comes from a cookie. force-static prerendered it once at
// build time, where there is no cookie, so every non-English visitor got this
// page in English permanently (a client cannot re-render a server component).
// Rendered per request instead, so the cookie language is honoured.
export const dynamic = "force-dynamic";


export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    alternates: { canonical: "/about" },
    title: t("about.metaTitle"),
    description: t("about.metaDesc"),
  };
}

export default async function AboutPage() {
  const t = await getTranslator(getLocale());

  const VALUES = [
    { icon: Target, title: t("about.v1Title"), desc: t("about.v1Desc") },
    { icon: Shield, title: t("about.v2Title"), desc: t("about.v2Desc") },
    { icon: Zap,    title: t("about.v3Title"), desc: t("about.v3Desc") },
    { icon: Heart,  title: t("about.v4Title"), desc: t("about.v4Desc") },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--cr-paper)" }}>
      <Navbar />

      {/* Hero -- eyebrow ruled label, serif italic display, one quiet sub. */}
      <section style={{ background: "var(--cr-paper)" }}>
        <div className="max-w-[880px] mx-auto px-6 md:px-10 py-16 md:py-24">
          <div className="ruled-label" style={{ marginBottom: "28px" }}>
            {t("about.metaTitle")}
          </div>
          <h1
            style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(30px, 5.5vw, 52px)",
              color:         "var(--cr-ink)",
              lineHeight:    1.08,
              letterSpacing: "-0.02em",
              textWrap:      "balance",
              marginBottom:  "24px",
            }}
          >
            {t("about.heroTitle")}
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", lineHeight: 1.7, maxWidth: "58ch" }}>
            {t("about.heroSub")}
          </p>
        </div>
      </section>

      {/* Mission -- the one band moment on this page. Also the target of the
          footer's "How it works" link. */}
      <section
        id="how-it-works"
        className="scroll-mt-20"
        style={{ background: "var(--cr-band-bg)", borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)" }}
      >
        <div className="max-w-[1040px] mx-auto px-6 md:px-10 py-16 md:py-24">
          <div className="grid md:grid-cols-[1fr_260px] gap-12 md:gap-16 items-start">
            <div>
              <div className="ruled-label" style={{ color: "var(--cr-band-ink-dim)", marginBottom: "24px" }}>
                {t("about.missionLabel")}
              </div>
              <h2
                style={{
                  fontFamily:    "'Playfair Display', Georgia, serif",
                  fontWeight:    700,
                  fontStyle:     "italic",
                  fontSize:      "clamp(22px, 3vw, 28px)",
                  color:         "var(--cr-band-ink)",
                  lineHeight:    1.25,
                  letterSpacing: "-0.01em",
                  textWrap:      "balance",
                  marginBottom:  "24px",
                }}
              >
                {t("about.missionTitle")}
              </h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-band-ink-dim)", lineHeight: 1.7, maxWidth: "62ch" }}>
                {t("about.missionP1")}
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-band-ink-dim)", lineHeight: 1.7, maxWidth: "62ch", marginTop: "16px" }}>
                {t("about.missionP2")}
              </p>
            </div>

            {/* The two numbers, hairline-ruled rows -- no stat boxes. */}
            <div style={{ borderTop: "1px solid var(--cr-copper-br)" }}>
              {[
                { label: t("about.statSuccessFee"), value: "2%" },
                { label: t("about.statAvgReview"), value: "48h" },
              ].map(stat => (
                <div
                  key={stat.label}
                  style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", padding: "20px 0", borderBottom: "1px solid var(--cr-copper-br)" }}
                >
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-band-ink-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {stat.label}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "clamp(22px, 3vw, 28px)", color: "var(--cr-copper)", lineHeight: 1 }}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values -- numbered rail, ledger lines between entries, no icon cards. */}
      <DealStory />

      <section style={{ background: "var(--cr-paper)" }}>
        <div className="max-w-[880px] mx-auto px-6 md:px-10 py-16 md:py-24">
          <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("about.valuesLabel")}</div>
          <h2
            style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(22px, 3vw, 28px)",
              color:         "var(--cr-ink)",
              letterSpacing: "-0.01em",
              marginBottom:  "40px",
            }}
          >
            {t("about.valuesTitle")}
          </h2>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {VALUES.map(({ title, desc }, i) => (
              <li
                key={title}
                className="grid grid-cols-[44px_1fr] md:grid-cols-[64px_1fr]"
                style={{ gap: "16px", padding: "24px 0", borderTop: "1px solid var(--cr-rule)", borderBottom: i === VALUES.length - 1 ? "1px solid var(--cr-rule)" : "none" }}
              >
                <span
                  aria-hidden
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", lineHeight: 1.5 }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "6px" }}>
                    {title}
                  </h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13.5px", color: "var(--cr-ink-3)", lineHeight: 1.65, maxWidth: "58ch" }}>
                    {desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Footer />
    </div>
  );
}
