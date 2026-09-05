"use client";

import Link from "next/link";
import { SECTOR_SLUGS } from "@/lib/industry-slugs";
import { useTranslation } from "@/hooks/useTranslation";

const DiamondLogo = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
    <rect x="1" y="1" width="8" height="8" rx="1"
      fill="none" stroke="var(--cr-copper)" strokeWidth="1.5"
      transform="rotate(45 5 5)" />
  </svg>
);

export function Footer() {
  const { t } = useTranslation();

  const LINK_GROUPS: [string, [string, string][]][] = [
    // The sector landing pages are the site's search-traffic catchers --
    // linking them from every page's footer keeps them one hop from
    // anywhere, which is what tells crawlers they matter.
    [t("footer.sectors"), SECTOR_SLUGS.slice(0, 6).map(({ slug, industry }) =>
      [industry, `/startups/sector/${slug}`] as [string, string])],
    [t("footer.platform"), [
      [t("footer.browseStartups"), "/startups"],
      [t("footer.findInvestors"),  "/investors"],
      [t("footer.aiTools"),        "/ai"],
      [t("footer.dataCentre"),     "/data"],
      [t("footer.pricing"),        "/pricing"],
    ]],
    [t("footer.founders"), [
      [t("footer.listYourStartup"), "/auth/signup"],
      [t("footer.howItWorks"),      "/about#how-it-works"],
      [t("footer.pricing"),         "/pricing#founders"],
      // "Success stories" (/about#stories) and "Platform stats" (/stats) both
      // used to sit here; the first pointed at content that does not exist
      // yet and the second duplicated the Data Centre linked above.
    ]],
    [t("footer.investors"), [
      [t("footer.browseDeals"),   "/startups"],
      [t("footer.aiMatching"),    "/ai#match"],
      [t("footer.dueDiligence"),  "/ai#due-diligence"],
      [t("footer.plans"),         "/pricing#investors"],
    ]],
    [t("footer.company"), [
      [t("footer.about"),    "/about"],
      [t("footer.blog"),     "/blog"],
      [t("footer.careers"),  "/careers"],
      [t("footer.contact"),  "/contact"],
      [t("footer.status"),   "/status"],
      [t("footer.terms"),    "/terms"],
      [t("footer.privacy"),  "/privacy"],
      [t("footer.imprint"),  "/imprint"],
    ]],
  ];

  return (
    <footer style={{ background: "var(--cr-paper-2)", borderTop: "1px solid var(--cr-rule-dark)" }}>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 pt-16 pb-8">

        {/* Copper promise line */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "8px", marginBottom: "40px",
          padding: "12px 0",
          borderTop: "1px solid var(--cr-copper-br)",
          borderBottom: "1px solid var(--cr-copper-br)",
        }}>
          <span style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
            fontSize: "12px", color: "var(--cr-copper)", letterSpacing: "0.05em",
            textAlign: "center",
          }}>
            ✦ {t("footer.feeStrip")}
          </span>
        </div>

        {/* Row 1 — logo + link groups */}
        <div className="flex flex-col lg:flex-row justify-between gap-10 mb-12">

          {/* Brand */}
          <div className="flex-shrink-0" style={{ maxWidth: "220px" }}>
            <Link href="/" className="flex items-center gap-[10px] w-fit select-none" style={{ textDecoration: "none" }}>
              <DiamondLogo />
              <span style={{
                fontFamily:    "'Playfair Display', Georgia, serif",
                fontWeight:    700,
                fontSize:      "17px",
                color:         "var(--cr-ink)",
                letterSpacing: "-0.02em",
              }}>
                CapitalReach
              </span>
            </Link>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize:   "14px",
              color:      "var(--cr-ink-3)",
              lineHeight: 1.6,
              marginTop:  "12px",
            }}>
              {t("footer.tagline")}
            </p>
          </div>

          {/* Link groups */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 flex-1 lg:max-w-[680px]">
            {LINK_GROUPS.map(([heading, links]) => (
              <div key={heading}>
                <h4 style={{
                  fontFamily:    "'DM Sans', sans-serif",
                  fontWeight:    500,
                  fontSize:      "11px",
                  color:         "var(--cr-ink-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom:  "16px",
                }}>
                  {heading}
                </h4>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {links.map(([label, href]) => (
                    <li key={label} style={{ marginBottom: "10px" }}>
                      <Link
                        href={href}
                        style={{
                          fontFamily:     "'DM Sans', sans-serif",
                          fontWeight:     300,
                          fontSize:       "14px",
                          color:          "var(--cr-ink-3)",
                          textDecoration: "none",
                          display:        "block",
                          transition:     "color 150ms ease",
                        }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink)")}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)")}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <hr style={{ border: "none", borderTop: "1px solid var(--cr-rule)", marginBottom: "32px" }} />

        {/* Row 2 — copyright / legal / social */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize:   "12px",
            color:      "var(--cr-ink-4)",
            flexShrink: 0,
          }}>
            © <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{new Date().getFullYear()}</span> CapitalReach Ltd.
          </p>

          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize:   "11px",
            color:      "var(--cr-ink-4)",
            textAlign:  "center",
            maxWidth:   "360px",
            lineHeight: 1.55,
          }}>
            {t("footer.legal")}
            <br />
            {t("footer.aiDisclosure")}
          </p>

          <div className="flex items-center gap-5 flex-shrink-0">
            {([
              // Real profiles only; placeholders removed. Add entries here
              // once the accounts exist.
            ] as [string, string][]).map(([label, href]) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily:     "'DM Sans', sans-serif",
                  fontWeight:     300,
                  fontSize:       "12px",
                  color:          "var(--cr-ink-4)",
                  textDecoration: "none",
                  transition:     "color 150ms ease",
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-2)")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-4)")}
              >
                {label}
              </a>
            ))}
          </div>
        </div>

      </div>
    </footer>
  );
}
