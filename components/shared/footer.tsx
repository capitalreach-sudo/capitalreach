"use client";

import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";

const DiamondLogo = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
    <rect x="1" y="1" width="8" height="8" rx="1"
      fill="none" stroke="#B5651D" strokeWidth="1.5"
      transform="rotate(45 5 5)" />
  </svg>
);

export function Footer() {
  const { t } = useTranslation();

  const LINK_GROUPS: [string, [string, string][]][] = [
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
      [t("footer.successStories"),  "/about#stories"],
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
      [t("footer.terms"),    "/terms"],
      [t("footer.privacy"),  "/privacy"],
    ]],
  ];

  return (
    <footer style={{ background: "#EDE8DE", borderTop: "1px solid rgba(26,22,18,0.15)" }}>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 pt-14 pb-8">

        {/* Copper promise line */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "8px", marginBottom: "40px",
          padding: "12px 0",
          borderTop: "1px solid rgba(181,101,29,0.2)",
          borderBottom: "1px solid rgba(181,101,29,0.2)",
        }}>
          <span style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
            fontSize: "12px", color: "#B5651D", letterSpacing: "0.05em",
            textAlign: "center",
          }}>
            ◆ 2% success fee · only after close · founders only · never investors
          </span>
        </div>

        {/* Row 1 — logo + link groups */}
        <div className="flex flex-col lg:flex-row justify-between gap-10 mb-14">

          {/* Brand */}
          <div className="flex-shrink-0" style={{ maxWidth: "220px" }}>
            <Link href="/" className="flex items-center gap-[10px] w-fit select-none" style={{ textDecoration: "none" }}>
              <DiamondLogo />
              <span style={{
                fontFamily:    "'Playfair Display', Georgia, serif",
                fontWeight:    700,
                fontSize:      "17px",
                color:         "#1A1612",
                letterSpacing: "-0.02em",
              }}>
                CapitalReach
              </span>
            </Link>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize:   "14px",
              color:      "#6B6056",
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
                  color:         "#9C8E82",
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
                          color:          "#6B6056",
                          textDecoration: "none",
                          display:        "block",
                          transition:     "color 150ms ease",
                        }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#1A1612")}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#6B6056")}
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
        <hr style={{ border: "none", borderTop: "1px solid rgba(26,22,18,0.1)", marginBottom: "32px" }} />

        {/* Row 2 — copyright / legal / social */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize:   "12px",
            color:      "#9C8E82",
            flexShrink: 0,
          }}>
            © {new Date().getFullYear()} CapitalReach Ltd.
          </p>

          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize:   "11px",
            color:      "#9C8E82",
            textAlign:  "center",
            maxWidth:   "360px",
            lineHeight: 1.55,
          }}>
            {t("footer.legal")}
          </p>

          <div className="flex items-center gap-5 flex-shrink-0">
            {([
              ["Twitter",   "https://twitter.com"],
              ["LinkedIn",  "https://linkedin.com"],
              ["AngelList", "https://angel.co"],
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
                  color:          "#9C8E82",
                  textDecoration: "none",
                  transition:     "color 150ms ease",
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#3D3630")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#9C8E82")}
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
