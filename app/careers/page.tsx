import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Button } from "@/components/ui/button";
import { Briefcase, Zap, Globe, Handshake } from "lucide-react";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { Metadata } from "next";
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
    title: t("careers.metaTitle"),
    description: t("careers.metaDesc"),
  };
}

// House Label type for role metadata (location, engagement type).
const META: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
  color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em",
};

export default async function CareersPage() {
  const t = await getTranslator(getLocale());

  const OPENINGS = [
    { title: t("careers.role1Title"), team: t("careers.role1Team"), location: t("careers.role1Location"), type: t("careers.fullTime"), desc: t("careers.role1Desc") },
    { title: t("careers.role2Title"), team: t("careers.role2Team"), location: t("careers.role2Location"), type: t("careers.fullTime"), desc: t("careers.role2Desc") },
    { title: t("careers.role3Title"), team: t("careers.role3Team"), location: t("careers.role3Location"), type: t("careers.fullTime"), desc: t("careers.role3Desc") },
    { title: t("careers.role4Title"), team: t("careers.role4Team"), location: t("careers.role4Location"), type: t("careers.fullTime"), desc: t("careers.role4Desc") },
  ];

  const PERKS = [
    { icon: Globe, title: t("careers.perk1Title"), desc: t("careers.perk1Desc") },
    { icon: Zap, title: t("careers.perk2Title"), desc: t("careers.perk2Desc") },
    { icon: Handshake, title: t("careers.perk3Title"), desc: t("careers.perk3Desc") },
    { icon: Briefcase, title: t("careers.perk4Title"), desc: t("careers.perk4Desc") },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--cr-paper)" }}>
      <Navbar />

      {/* Hero -- eyebrow ruled label, serif italic display, one quiet sub. */}
      <section style={{ background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule)" }}>
        <div className="max-w-[880px] mx-auto px-6 md:px-10 py-16 md:py-24">
          <div className="ruled-label" style={{ marginBottom: "24px" }}>
            {t("careers.metaTitle")}
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
            {t("careers.heroLine1")}<br />
            <span className="copper-foil">{t("careers.heroLine2")}</span>
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", lineHeight: 1.7, maxWidth: "58ch" }}>
            {t("careers.heroSub")}
          </p>
        </div>
      </section>

      {/* Perks -- numbered rail, ledger lines between entries, no icon cards. */}
      <section style={{ background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule)" }}>
        <div className="max-w-[880px] mx-auto px-6 md:px-10 py-16 md:py-24">
          <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("careers.whyLabel")}</div>
          <h2
            style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(22px, 3vw, 28px)",
              color:         "var(--cr-ink)",
              letterSpacing: "-0.01em",
              marginBottom:  "32px",
            }}
          >
            {t("careers.whyTitle")}
          </h2>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {PERKS.map(({ title, desc }, i) => (
              <li
                key={title}
                className="grid grid-cols-[44px_1fr] md:grid-cols-[64px_1fr]"
                style={{ gap: "16px", padding: "24px 0", borderTop: "1px solid var(--cr-rule)", borderBottom: i === PERKS.length - 1 ? "1px solid var(--cr-rule)" : "none" }}
              >
                <span
                  aria-hidden
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", lineHeight: 1.5 }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "4px" }}>
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

      {/* Open roles -- rule-separated rows, quiet outline Apply. */}
      <section style={{ background: "var(--cr-paper)" }}>
        <div className="max-w-[880px] mx-auto px-6 md:px-10 py-16 md:py-24">
          <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("careers.openRolesLabel")}</div>
          <h2
            style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(22px, 3vw, 28px)",
              color:         "var(--cr-ink)",
              letterSpacing: "-0.01em",
              marginBottom:  "8px",
            }}
          >
            {t("careers.hiringTitle")}
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.7, marginBottom: "32px" }}>
            {t("careers.hiringSub")}
          </p>

          <div>
            {OPENINGS.map((role, i) => (
              <div
                key={role.title}
                className="flex flex-col sm:flex-row sm:items-center"
                style={{ gap: "16px", padding: "24px 0", borderTop: "1px solid var(--cr-rule)", borderBottom: i === OPENINGS.length - 1 ? "1px solid var(--cr-rule)" : "none" }}
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center" style={{ gap: "12px", marginBottom: "8px" }}>
                    <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>{role.title}</h3>
                    <span
                      style={{
                        background: "var(--cr-paper-2)", border: "1px solid var(--cr-paper-4)", borderRadius: "3px",
                        padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                        fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {role.team}
                    </span>
                  </div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13.5px", color: "var(--cr-ink-3)", lineHeight: 1.65, marginBottom: "8px", maxWidth: "58ch" }}>{role.desc}</p>
                  <p className="flex flex-wrap items-center" style={{ ...META, gap: "12px" }}>
                    <span>{role.location}</span>
                    <span aria-hidden>·</span>
                    <span>{role.type}</span>
                  </p>
                </div>
                <a href={`mailto:careers@capitalreach.app?subject=${encodeURIComponent(`Application: ${role.title}`)}`} className="self-start sm:self-center">
                  <Button variant="outline" className="flex-shrink-0 border-cr-p4 bg-transparent text-cr-ink hover:bg-cr-p2 hover:text-cr-ink">
                    {t("careers.applyNow")}
                  </Button>
                </a>
              </div>
            ))}
          </div>

          {/* Closing moment -- centered, one primary on the page. */}
          <div className="text-center" style={{ marginTop: "48px", borderTop: "1px solid var(--cr-rule)", paddingTop: "48px" }}>
            <h3
              style={{
                fontFamily:    "'Playfair Display', Georgia, serif",
                fontWeight:    700,
                fontStyle:     "italic",
                fontSize:      "clamp(22px, 3vw, 28px)",
                color:         "var(--cr-ink)",
                letterSpacing: "-0.01em",
                textWrap:      "balance",
                marginBottom:  "8px",
              }}
            >
              {t("careers.noRoleTitle")}
            </h3>
            <p className="max-w-md mx-auto" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.7, marginBottom: "24px" }}>
              {t("careers.noRoleDesc")}
            </p>
            <a href={`mailto:${brand.careers}`} className="inline-flex">
              <Button className="px-6">{t("careers.getInTouch")}</Button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
