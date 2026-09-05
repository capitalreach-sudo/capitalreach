import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { brand } from "@/lib/brand";

// The whole body is rendered on the SERVER with getTranslator(getLocale()),
// and the locale comes from a cookie. force-static prerendered it once at
// build time, where there is no cookie, so every non-English visitor got this
// page in English permanently (a client cannot re-render a server component).
// Rendered per request instead, so the cookie language is honoured.
export const dynamic = "force-dynamic";


export async function generateMetadata() {
  const t = await getTranslator(getLocale());
  return {
    title: t("disclaimer.metaTitle"),
    description: t("disclaimer.metaDesc"),
  };
}

// House prose register for the legal pages: quiet rule-separated sections,
// Label-style section openers, body in DM Sans light.
const BODY: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px",
  color: "var(--cr-ink-3)", lineHeight: 1.7,
};

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid var(--cr-rule)", padding: "24px 0" }}>
      <h2 className="ruled-label" style={{ marginBottom: "12px" }}>{title}</h2>
      <div style={BODY}>{children}</div>
    </section>
  );
}

export default async function DisclaimerPage() {
  const t = await getTranslator(getLocale());

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--cr-paper)" }}>
      <Navbar />

      <main className="mx-auto w-full px-6 md:px-10 py-16 md:py-24 max-w-3xl flex-1">
        {/* Header -- ruled-label opener, serif italic display, date in mono. */}
        <header style={{ marginBottom: "48px" }}>
          <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("privacy.legalLabel")}</div>
          <h1
            style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(30px, 5vw, 44px)",
              color:         "var(--cr-ink)",
              lineHeight:    1.08,
              letterSpacing: "-0.02em",
              textWrap:      "balance",
              marginBottom:  "12px",
            }}
          >
            {t("disclaimer.title")}
          </h1>
          <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-4)" }}>
            {t("disclaimer.lastUpdatedPrefix")}{" "}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-3)" }}>
              {t("disclaimer.lastUpdated")}
            </span>
          </p>
        </header>

        {/* The one loud moment on the page: the risk notice, on copper --
            quality/warning states are copper, never amber or green. */}
        <div
          style={{
            background:   "var(--cr-copper-bg)",
            border:       "1px solid var(--cr-copper-br)",
            borderRadius: "var(--radius)",
            padding:      "16px 24px",
            marginBottom: "32px",
          }}
        >
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
            {t("disclaimer.noticeLabel")}
          </p>
          <p style={{ ...BODY, color: "var(--cr-ink-2)" }}>
            {t("disclaimer.noticeText")}
          </p>
        </div>

        <div>
          <LegalSection title={t("disclaimer.s1Title")}>
            <p>
              {t("disclaimer.s1Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("disclaimer.s2Title")}>
            <p style={{ marginBottom: "12px" }}>
              {t("disclaimer.s2Intro")}
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>{t("disclaimer.s2l1")}</li>
              <li>{t("disclaimer.s2l2")}</li>
              <li>{t("disclaimer.s2l3")}</li>
              <li>{t("disclaimer.s2l4")}</li>
              <li>{t("disclaimer.s2l5")}</li>
            </ul>
          </LegalSection>

          <LegalSection title={t("disclaimer.s3Title")}>
            <p>
              {t("disclaimer.s3Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("disclaimer.s4Title")}>
            <p>
              {t("disclaimer.s4Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("disclaimer.s5Title")}>
            <p>
              {t("disclaimer.s5Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("disclaimer.s6Title")}>
            <p>
              {t("disclaimer.s6Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("disclaimer.s7Title")}>
            <p>
              {t("disclaimer.s7Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("disclaimer.s8Title")}>
            <p>
              {t("disclaimer.s8Text").split("{link}")[0]}
              <a href={`mailto:${brand.legal}`} className="text-cr-copper hover:underline" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px" }}>{brand.legal}</a>
              {t("disclaimer.s8Text").split("{link}")[1]}
            </p>
          </LegalSection>
        </div>
      </main>

      <Footer />
    </div>
  );
}
