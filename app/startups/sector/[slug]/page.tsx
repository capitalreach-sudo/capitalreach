import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { StartupCard, type StartupCardData } from "@/components/startup/startup-card";
import { SECTOR_SLUGS, industryFromSlug } from "@/lib/industry-slugs";

/**
 * Sector landing pages: /startups/sector/fintech and friends.
 *
 * Search traffic arrives by sector, not by brand — nobody googles
 * "CapitalReach", but "fintech startups raising" is a real query. One page
 * per industry in the shared INDUSTRIES list, statically generated and
 * revalidated hourly, listing that sector's active raises with an honest
 * empty state that still gives a crawler and a founder something to land on.
 *
 * The copy states what the page IS rather than puffing: these pages exist to
 * rank and convert, and thin superlatives do neither.
 */
interface Props {
  params: { slug: string };
}

export const revalidate = 3600;

export function generateStaticParams() {
  return SECTOR_SLUGS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const industry = industryFromSlug(params.slug);
  if (!industry) return {};
  return {
    title: `${industry} startups raising capital`,
    description: `Vetted ${industry} startups raising on CapitalReach — funding targets, traction and stage, with a 2% success fee paid by the startup only at close.`,
  };
}

// i18n note: deliberately English-only. These are SSG SEO landing pages
// (generateStaticParams); reading the locale cookie would force them dynamic.
// Same policy as /blog.
export default async function SectorPage({ params }: Props) {
  const industry = industryFromSlug(params.slug);
  if (!industry) notFound();

  const admin = createAdminClient();
  const { data: startups } = await admin
    .from("startups")
    .select("id, slug, name, tagline, industry, stage, funding_target, mrr, arr, growth_rate, runway_months, created_at, vaultrise_score, round_close_date")
    .eq("status", "active")
    .eq("industry", industry)
    .order("created_at", { ascending: false })
    .limit(24)
    .returns<StartupCardData[]>();

  // This page is statically generated for anonymous crawlers and always passes
  // investorTier={null} to the card, so gated MRR/ARR are never displayed here.
  // Null them so the figures are not shipped in the prerendered payload either.
  const list = (startups ?? []).map((s) => ({ ...s, mrr: null, arr: null }));

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "70vh" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 24px 80px" }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--cr-copper)", marginBottom: "10px" }}>
            {industry}
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "clamp(28px, 4vw, 40px)", color: "var(--cr-ink)", marginBottom: "10px" }}>
            {industry} startups raising capital
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", maxWidth: "60ch", lineHeight: 1.7, marginBottom: "10px" }}>
            Every listing below was reviewed by CapitalReach before going live. Funding target,
            stage and traction are shown up front; the platform charges the startup a 2% success fee at close (investors pay nothing)
            and nothing before it.
          </p>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "36px" }}>
            <Link href={`/startups?industries=${encodeURIComponent(industry)}`}
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
              Filter and compare in the full directory →
            </Link>
          </div>

          {list.length === 0 ? (
            <div style={{ border: "1px dashed var(--cr-rule-dark)", borderRadius: "8px", background: "var(--cr-paper-2)", padding: "48px 24px", textAlign: "center" }}>
              <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "17px", color: "var(--cr-ink)", marginBottom: "8px" }}>
                No {industry} rounds are open right now
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", maxWidth: "44ch", margin: "0 auto 16px", lineHeight: 1.7 }}>
                Raising in {industry}? Listing is free during launch and every listing is
                reviewed before it goes live.
              </p>
              <Link href="/auth/signup?role=startup"
                style={{ display: "inline-flex", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", borderRadius: "4px", padding: "11px 24px", textDecoration: "none" }}>
                List your startup
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {list.map((s) => (
                <StartupCard key={s.id} startup={s} investorTier={null} />
              ))}
            </div>
          )}

          {/* Sector index, so every sector page links every other -- crawlers
              find the whole set from any one of them. */}
          <div style={{ marginTop: "56px", borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "20px" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
              Browse by sector
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {SECTOR_SLUGS.map(({ slug, industry: name }) => (
                <Link key={slug} href={`/startups/sector/${slug}`}
                  style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: "12px", borderRadius: "999px", padding: "5px 12px", textDecoration: "none",
                    border: name === industry ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
                    background: name === industry ? "var(--cr-copper-bg)" : "var(--cr-paper-2)",
                    color: name === industry ? "var(--cr-copper)" : "var(--cr-ink-3)",
                  }}>
                  {name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
