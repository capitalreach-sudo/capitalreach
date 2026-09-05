import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { Metadata } from "next";
import type { ServerT } from "@/lib/locale-server";
import { brand } from "@/lib/brand";

// The whole body is rendered on the SERVER with getTranslator(getLocale()),
// and the locale comes from a cookie. force-static prerendered it once at
// build time, where there is no cookie, so every non-English visitor got this
// page in English permanently (a client cannot re-render a server component).
// Rendered per request instead, so the cookie language is honoured.
export const dynamic = "force-dynamic";


export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    alternates: { canonical: "/privacy" },
    title: t("privacy.metaTitle"),
    description: t("privacy.metaDesc"),
  };
}

// House prose register for the legal pages: quiet rule-separated sections,
// Label-style section openers, body in DM Sans light.
const BODY: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px",
  color: "var(--cr-ink-3)", lineHeight: 1.7,
};

const SUBHEAD: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px",
  color: "var(--cr-ink)",
};

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid var(--cr-rule)", padding: "24px 0" }}>
      <h2 className="ruled-label" style={{ marginBottom: "12px" }}>{title}</h2>
      <div style={BODY}>{children}</div>
    </section>
  );
}

function Bullet({ t, k }: { t: ServerT; k: string }) {
  const [bold, rest] = t(`privacy.${k}`).split("|||");
  return (
    <li>
      <strong style={{ fontWeight: 600, color: "var(--cr-ink-2)" }}>{bold}</strong> {rest}
    </li>
  );
}

function InlineLink({ t, k, href, label }: { t: ServerT; k: string; href: string; label: string }) {
  const [before, after] = t(`privacy.${k}`).split("{link}");
  return (
    <>
      {before}
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined} className="text-cr-copper hover:underline">
        {label}
      </a>
      {after}
    </>
  );
}

export default async function PrivacyPage() {
  const t = await getTranslator(getLocale());

  return (
    <>
      <Navbar />
      <main className="mx-auto px-6 md:px-10 py-16 md:py-24 max-w-3xl" style={{ background: "var(--cr-paper)" }}>
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
            {t("privacy.title")}
          </h1>
          <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-4)" }}>
            {t("privacy.effectiveDatePrefix")}{" "}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-3)" }}>
              {t("privacy.effectiveDate")}
            </span>
          </p>
        </header>

        <div>

          <section style={{ paddingBottom: "24px" }}>
            <p style={BODY}>
              <InlineLink t={t} k="introP1" href={brand.url} label={brand.domain} />
            </p>
          </section>

          <LegalSection title={t("privacy.s1Title")}>
            <h3 style={{ ...SUBHEAD, marginBottom: "8px" }}>{t("privacy.s1h1")}</h3>
            <ul className="list-disc pl-5 space-y-2">
              <Bullet t={t} k="s1l1" />
              <Bullet t={t} k="s1l2" />
              <Bullet t={t} k="s1l3" />
              <Bullet t={t} k="s1l4" />
              <Bullet t={t} k="s1l5" />
            </ul>

            <h3 style={{ ...SUBHEAD, marginBottom: "8px", marginTop: "16px" }}>{t("privacy.s1h2")}</h3>
            <ul className="list-disc pl-5 space-y-2">
              <Bullet t={t} k="s1l6" />
              <Bullet t={t} k="s1l7" />
              <Bullet t={t} k="s1l8" />
            </ul>
          </LegalSection>

          <LegalSection title={t("privacy.s2Title")}>
            <ul className="list-disc pl-5 space-y-2">
              <li>{t("privacy.s2l1")}</li>
              <li>{t("privacy.s2l2")}</li>
              <li>{t("privacy.s2l3")}</li>
              <li>{t("privacy.s2l4")}</li>
              <li>{t("privacy.s2l5")}</li>
              <li><InlineLink t={t} k="s2l6" href="/terms" label={t("privacy.termsOfServiceLabel")} /></li>
              <li>{t("privacy.s2l7")}</li>
            </ul>
          </LegalSection>

          {/* E58. Audited rather than assumed: this app loads no third-party
              script, sets no analytics or advertising cookie, and stores
              nothing that identifies a visitor before they sign in. Under
              GDPR/ePrivacy that means no consent banner is required -- and a
              banner asking permission for nothing would be theatre. What IS
              stored is listed here instead, exactly. */}
          <LegalSection title={t("privacy.cookiesTitle")}>
            <p style={{ marginBottom: "12px" }}>{t("privacy.cookiesIntro")}</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>{t("privacy.cookiesAuth")}</li>
              <li>{t("privacy.cookiesLocale")}</li>
              <li>{t("privacy.cookiesLocal")}</li>
            </ul>
            <p style={{ marginTop: "12px" }}>{t("privacy.cookiesNoTracking")}</p>
          </LegalSection>

          <LegalSection title={t("privacy.s3Title")}>
            <p style={{ marginBottom: "12px" }}>
              {t("privacy.s3Intro")}
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <Bullet t={t} k="s3l1" />
              <Bullet t={t} k="s3l2" />
              <Bullet t={t} k="s3l3" />
              <Bullet t={t} k="s3l4" />
            </ul>
          </LegalSection>

          <LegalSection title={t("privacy.s4Title")}>
            <p>
              {t("privacy.s4Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("privacy.s5Title")}>
            <p style={{ marginBottom: "12px" }}>{t("privacy.s5Intro")}</p>
            <ul className="list-disc pl-5 space-y-2">
              <Bullet t={t} k="s5l1" />
              <Bullet t={t} k="s5l2" />
              <li><InlineLink t={t} k="s5l3" href={`mailto:${brand.support}`} label={brand.support} /></li>
              <Bullet t={t} k="s5l4" />
              <Bullet t={t} k="s5l5" />
              <Bullet t={t} k="s5l6" />
            </ul>
            <p style={{ marginTop: "12px" }}>
              <InlineLink t={t} k="s5Footer" href={`mailto:${brand.support}`} label={brand.support} />
            </p>
          </LegalSection>

          <LegalSection title={t("privacy.s6Title")}>
            <p style={{ marginBottom: "12px" }}>{t("privacy.s6Intro")}</p>
            <ul className="list-disc pl-5 space-y-2">
              <Bullet t={t} k="s6l1" />
              <Bullet t={t} k="s6l2" />
              <Bullet t={t} k="s6l3" />
            </ul>
            <p style={{ marginTop: "8px" }}>
              {t("privacy.s6Footer")}
            </p>
          </LegalSection>

          <LegalSection title={t("privacy.s7Title")}>
            <p>
              <InlineLink t={t} k="s7Text" href="https://openai.com/enterprise-privacy" label={t("privacy.s7LinkLabel")} />
            </p>
          </LegalSection>

          <LegalSection title={t("privacy.s8Title")}>
            <p>
              <InlineLink t={t} k="s8Text" href={`mailto:${brand.support}`} label={brand.support} />
            </p>
          </LegalSection>

          <LegalSection title={t("privacy.s9Title")}>
            <p>
              {t("privacy.s9Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("privacy.s10Title")}>
            <p>
              {t("privacy.s10Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("privacy.s11Title")}>
            <p>
              {t("privacy.s11Text")}
            </p>
          </LegalSection>

          <LegalSection title={t("privacy.s12Title")}>
            <p>
              {t("privacy.s12Text")}
            </p>
            {/* Controller block as a rule-topped ledger entry, not a box. */}
            <div style={{ marginTop: "16px", borderTop: "1px solid var(--cr-rule)", paddingTop: "16px" }}>
              <p style={{ ...SUBHEAD, marginBottom: "4px" }}>CapitalReach</p>
              <p style={BODY}>
                {t("privacy.contactBoxEmailLabel")}{" "}
                <a href={`mailto:${brand.support}`} className="text-cr-copper hover:underline" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px" }}>
                  {brand.support}
                </a>
              </p>
              <p style={{ ...BODY, marginTop: "4px" }}>
                <Link href="/contact" className="text-cr-copper hover:underline">{t("privacy.contactFormLink")}</Link>
              </p>
            </div>
          </LegalSection>

        </div>

        {/* Footer links -- quiet, rule-topped, 40px touch rows. */}
        <div className="mt-12 flex flex-wrap gap-x-6 gap-y-0" style={{ borderTop: "1px solid var(--cr-rule)", paddingTop: "16px" }}>
          <Link href="/terms" className="text-cr-i3 hover:text-cr-copper inline-flex items-center min-h-[40px] transition-colors" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", textDecoration: "none" }}>{t("privacy.termsOfServiceLabel")}</Link>
          <Link href="/contact" className="text-cr-i3 hover:text-cr-copper inline-flex items-center min-h-[40px] transition-colors" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", textDecoration: "none" }}>{t("privacy.footerContactUs")}</Link>
          <Link href="/" className="text-cr-i3 hover:text-cr-copper inline-flex items-center min-h-[40px] transition-colors" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", textDecoration: "none" }}>{t("privacy.footerBackHome")}</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
