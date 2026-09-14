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
              fontFamily:    "var(--font-serif)",
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
          {/* Closing moment -- centered, one primary on the page. */}
          <div className="text-center" style={{ marginTop: "8px" }}>
            <h3
              style={{
                fontFamily:    "var(--font-serif)",
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
            {/* No fabricated openings, no dead buttons: the four invented
                roles (applying to a domain the project does not own, with
                email muted besides) are gone, and the CTA renders only when
                a careers address actually exists. */}
            {brand.careers && (
              <a href={`mailto:${brand.careers}`} className="inline-flex">
                <Button className="px-6">{t("careers.getInTouch")}</Button>
              </a>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
