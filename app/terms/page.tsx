import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { getLocale, getTranslator } from "@/lib/locale-server";
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
    alternates: { canonical: "/terms" },
    title: t("terms.metaTitle"),
    description: t("terms.metaDesc"),
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

function Bullet({ t, k }: { t: ServerT; k: string }) {
  const raw = t(`terms.${k}`);
  if (!raw.includes("|||")) return <li>{raw}</li>;
  const [bold, rest] = raw.split("|||");
  return (
    <li>
      <strong style={{ fontWeight: 600, color: "var(--cr-ink-2)" }}>{bold}</strong> {rest}
    </li>
  );
}

function InlineLink({ t, k, href, label }: { t: ServerT; k: string; href: string; label: string }) {
  const [before, after] = t(`terms.${k}`).split("{link}");
  return (
    <>
      {before}
      <a href={href} className="text-cr-copper hover:underline">
        {label}
      </a>
      {after}
    </>
  );
}

export default async function TermsPage() {
  const t = await getTranslator(getLocale());

  return (
    <>
      <Navbar />
      <main className="mx-auto px-6 md:px-10 py-16 md:py-24 max-w-3xl">
        {/* Header -- ruled-label opener, serif italic display, date in mono. */}
        <header style={{ marginBottom: "48px" }}>
          <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("terms.brandLabel")}</div>
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
            {t("terms.title")}
          </h1>
          <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-4)" }}>
            {t("terms.lastUpdatedPrefix")}{" "}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-3)" }}>
              {t("terms.lastUpdated")}
            </span>
          </p>
        </header>

        <div>

          <section style={{ paddingBottom: "24px" }}>
            <p style={BODY}>
              {t("terms.introText")}
            </p>
          </section>

          <Section title={t("terms.s1Title")}>
            <p>{t("terms.s1p1")}</p>
            <p className="mt-3">{t("terms.s1p2")}</p>
          </Section>

          <Section title={t("terms.s2Title")}>
            <p>{t("terms.s2p1")}</p>
            <ul className="mt-3 space-y-2 list-disc pl-5">
              <Bullet t={t} k="s2l1" />
              <Bullet t={t} k="s2l2" />
              <Bullet t={t} k="s2l3" />
              <Bullet t={t} k="s2l4" />
            </ul>
            <p className="mt-3">{t("terms.s2p2")}</p>
          </Section>

          <Section title={t("terms.s3Title")}>
            <p>
              <InlineLink t={t} k="s3p1" href={`mailto:${brand.support}`} label={brand.support} />
            </p>
            <p className="mt-3">{t("terms.s3p2")}</p>
          </Section>

          <Section title={t("terms.s4Title")}>
            <p>{t("terms.s4p1")}</p>

            <h3 className="mt-4 mb-2" style={SUBHEAD}>{t("terms.s4h1")}</h3>
            <p>
              <InlineLink t={t} k="s4h1p1" href="/pricing" label={t("pricing.title")} />
            </p>

            <h3 className="mt-4 mb-2" style={SUBHEAD}>{t("terms.s4h2")}</h3>
            <p>{t("terms.s4h2p1")}</p>
            <p className="mt-3">{t("terms.s4h2p2")}</p>
            <p className="mt-3">{t("terms.s4h2p3", { email: brand.billing })}</p>

            <h3 className="mt-4 mb-2" style={SUBHEAD}>{t("terms.s4h3")}</h3>
            <p>
              <InlineLink t={t} k="s4h3p1" href={`mailto:${brand.billing}`} label={brand.billing} />
            </p>
          </Section>

          <Section title={t("terms.s5Title")}>
            <p>{t("terms.s5p1")}</p>
            <p className="mt-3">{t("terms.s5p2")}</p>
            <ul className="mt-2 space-y-2 list-disc pl-5">
              <li>{t("terms.s5l1")}</li>
              <li>{t("terms.s5l2")}</li>
              <li>{t("terms.s5l3")}</li>
              <li>{t("terms.s5l4")}</li>
            </ul>
            <p className="mt-3">{t("terms.s5p3")}</p>
          </Section>

          <Section title={t("terms.s6Title")}>
            <p>{t("terms.s6p1")}</p>
            <ul className="mt-3 space-y-2 list-disc pl-5">
              <li>{t("terms.s6l1")}</li>
              <li>{t("terms.s6l2")}</li>
              <li>{t("terms.s6l3")}</li>
              <li>{t("terms.s6l4")}</li>
              <li>{t("terms.s6l5")}</li>
              <li>{t("terms.s6l6")}</li>
              <li>{t("terms.s6l7")}</li>
              <li>{t("terms.s6l8")}</li>
              <li>{t("terms.s6l9")}</li>
            </ul>
          </Section>

          <Section title={t("terms.s7Title")}>
            <p>
              <strong style={{ fontWeight: 600, color: "var(--cr-ink-2)" }}>{t("terms.s7p1Bold")}</strong> {t("terms.s7p1Rest")}
            </p>
            <p className="mt-3">{t("terms.s7p2")}</p>
            <p className="mt-3">{t("terms.s7p3")}</p>
          </Section>

          <Section title={t("terms.s8Title")}>
            <p>{t("terms.s8p1")}</p>
            <p className="mt-3">{t("terms.s8p2")}</p>
          </Section>

          <Section title={t("terms.s9Title")}>
            <p>{t("terms.s9p1")}</p>
            <p className="mt-3">{t("terms.s9p2")}</p>
          </Section>

          <Section title={t("terms.s10Title")}>
            <p>
              <InlineLink t={t} k="s10p1" href="/privacy" label={t("privacy.title")} />
            </p>
          </Section>

          <Section title={t("terms.s11Title")}>
            <p>{t("terms.s11p1")}</p>
          </Section>

          <Section title={t("terms.s12Title")}>
            <p>{t("terms.s12p1")}</p>
            <p className="mt-3">{t("terms.s12p2")}</p>
            <p className="mt-3">{t("terms.s12p3")}</p>
          </Section>

          <Section title={t("terms.s13Title")}>
            <p>{t("terms.s13p1")}</p>
          </Section>

          <Section title={t("terms.s14Title")}>
            <p>{t("terms.s14p1")}</p>
            <p className="mt-3">
              <InlineLink t={t} k="s14p2" href={`mailto:${brand.support}`} label={brand.support} />
            </p>
          </Section>

          <Section title={t("terms.s15Title")}>
            <p>{t("terms.s15p1")}</p>
          </Section>

          <Section title={t("terms.s16Title")}>
            <p>{t("terms.s16p1")}</p>
            <p className="mt-3">{t("terms.s16p2")}</p>
          </Section>

          <Section title={t("terms.s17Title")}>
            <p>{t("terms.s17p1")}</p>
            {/* Contact block as a rule-topped ledger entry, not a box. */}
            <div style={{ marginTop: "16px", borderTop: "1px solid var(--cr-rule)", paddingTop: "16px" }}>
              <p style={{ ...SUBHEAD, marginBottom: "4px" }}>{t("terms.contactBrand")}</p>
              <p style={BODY}>
                {t("terms.emailLabel")}{" "}
                <a href={`mailto:${brand.legal}`} className="text-cr-copper hover:underline" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px" }}>{brand.legal}</a>
              </p>
              <p style={{ ...BODY, marginTop: "4px" }}>
                {t("terms.supportLabel")}{" "}
                <a href={`mailto:${brand.support}`} className="text-cr-copper hover:underline" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px" }}>{brand.support}</a>
              </p>
            </div>
          </Section>

          <div style={{ borderTop: "1px solid var(--cr-rule)", paddingTop: "24px" }}>
            <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-4)" }}>
              {t("terms.footerAck")}
            </p>
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid var(--cr-rule)", padding: "24px 0" }}>
      <h2 className="ruled-label" style={{ marginBottom: "12px" }}>{title}</h2>
      <div style={BODY}>{children}</div>
    </section>
  );
}
