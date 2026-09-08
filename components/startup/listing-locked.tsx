import Link from "next/link";
import { STAGE_LABELS } from "@/lib/utils";
import { safeFormatCurrency } from "@/lib/format";
import { getLocale, getTranslator } from "@/lib/locale-server";

/**
 * What a free member sees instead of a company's pitch.
 *
 * The browse index is a catalogue and the detail page is the thesis --
 * problem, solution, market, use of funds. Reading it is what a plan buys.
 * So a free account still gets the OVERVIEW it saw on the card, plus a plain
 * statement of what a plan adds and one way to get it.
 *
 * Rendered on the server and returned INSTEAD of the real page, so the gated
 * prose is never serialised into a payload a curious reader could open.
 * The card fields repeated here are the same ones the public index already
 * shows, so nothing is disclosed that was not already visible.
 */
export async function ListingLocked({ startup }: {
  startup: {
    name: string;
    tagline: string | null;
    industry: string | null;
    stage: string | null;
    funding_target: number | null;
    country: string | null;
  };
}) {
  const t = await getTranslator(getLocale());

  const LABEL: React.CSSProperties = {
    fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
    textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
  };
  const VALUE: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px",
    color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums", marginTop: "8px",
  };

  const facts: Array<[string, string]> = [
    [t("listings.industry"), startup.industry ?? "—"],
    [t("listings.stage"), startup.stage ? (STAGE_LABELS[startup.stage] ?? startup.stage) : "—"],
    [t("listings.raising"), safeFormatCurrency(startup.funding_target)],
  ];

  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "70vh" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "64px 24px 96px" }}>
        <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("listings.title")}</div>

        <h1 style={{
          fontFamily: "var(--font-serif)", fontWeight: 700, fontStyle: "italic",
          fontSize: "clamp(28px, 4vw, 40px)", color: "var(--cr-ink)",
          letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "12px",
        }}>
          {startup.name}
        </h1>
        {startup.tagline && (
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "16px",
            color: "var(--cr-ink-3)", lineHeight: 1.6, maxWidth: "56ch", marginBottom: "32px",
          }}>
            {startup.tagline}
          </p>
        )}

        {/* The overview, hairline-divided -- exactly the fields the public
            browse card already carries. */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "1px", background: "var(--cr-rule)",
          border: "1px solid var(--cr-rule)", borderRadius: "4px", overflow: "hidden",
          marginBottom: "48px",
        }}>
          {facts.map(([label, value]) => (
            <div key={label} style={{ background: "var(--cr-paper)", padding: "16px" }}>
              <div style={LABEL}>{label}</div>
              <div style={VALUE}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "32px" }}>
          <p style={{
            fontFamily: "var(--font-serif)", fontWeight: 600, fontStyle: "italic",
            fontSize: "clamp(19px, 2.4vw, 24px)", color: "var(--cr-ink)",
            letterSpacing: "-0.01em", marginBottom: "12px", textWrap: "balance",
          }}>
            {t("locked.title")}
          </p>
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14.5px",
            color: "var(--cr-ink-3)", lineHeight: 1.7, maxWidth: "58ch", marginBottom: "32px",
          }}>
            {t("locked.body")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
            <Link href="/pricing" className="btn-copper-shimmer" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minHeight: "40px", padding: "0 28px", borderRadius: "999px",
              background: "var(--cr-copper)", color: "var(--cr-band-ink)",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px",
              textDecoration: "none",
            }}>
              {t("locked.cta")}
            </Link>
            <Link href="/startups" style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
              color: "var(--cr-ink-4)", textDecoration: "none",
              minHeight: "40px", display: "inline-flex", alignItems: "center",
            }}>
              {t("locked.back")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
