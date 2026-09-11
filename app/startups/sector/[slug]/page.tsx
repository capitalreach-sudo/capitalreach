import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { browseIndexPublic } from "@/lib/listing-visibility";
import { stripCardFinancials } from "@/lib/browse-data";
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

/**
 * Rendered per request, not prerendered, and that is a correction rather than
 * a preference.
 *
 * These pages were `revalidate = 3600` plus generateStaticParams, which reads
 * as a cheap SEO win and was not one. createAdminClient pins every request to
 * `cache: "no-store"` on purpose (lib/supabase-server.ts:48, so a listing edit
 * is never served from Next's fetch cache), and a no-store fetch inside a
 * statically generated page raises DynamicServerError. supabase-js caught that
 * error and handed it back as `{ data: null, error }`, the old code destructured
 * `data` alone, and so every sector page prerendered with an empty list and
 * stayed that way for an hour at a time. Confirmed on production before this
 * change: /startups/sector/ai-machine-learning carried zero listing links.
 *
 * So the choice is not static-versus-dynamic, it is empty-versus-correct. Two
 * dozen sectors answering a query for at most 24 rows is a cheap page to
 * render on demand.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const industry = industryFromSlug(params.slug);
  if (!industry) return {};
  // While the browse index is members-only, an anonymous crawler gets this
  // page with zero listings on it: twelve words of chrome under a robots tag
  // that said "index, follow". Twenty indexable empty pages is what Google
  // files as thin content, a negative signal for the whole domain. So the
  // robots verdict FOLLOWS the config: the moment public_browse_index opens,
  // these pages carry content again and re-invite the crawler on their own.
  const indexable = await browseIndexPublic();
  return {
    title: `${industry} startups raising capital`,
    description: `${industry} startups raising on CapitalReach — funding targets, traction and stage, with a 2% success fee paid by the startup only at close.`,
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

// i18n note: deliberately English-only. These are SEO landing pages written
// for a crawler rather than for a signed-in member, and the reason no longer
// has anything to do with rendering mode -- the page is dynamic now. Same
// policy as /blog.
export default async function SectorPage({ params }: Props) {
  // Same rule as the index: a sector page is the catalogue, filtered.
  if (!(await browseIndexPublic())) {
    const gate = await createServerSupabaseClient();
    const { data: { user } } = await gate.auth.getUser();
    if (!user) redirect(`/auth/login?redirect=/startups/sector/${params.slug}`);
  }
  const industry = industryFromSlug(params.slug);
  if (!industry) notFound();

  const admin = createAdminClient();
  // Same query shape as loadActiveStartups, one industry narrower -- the shared
  // loader takes no industry argument, so the filters are repeated here rather
  // than the whole market being loaded and sliced down to one sector.
  const { data: startups, error } = await admin
    .from("startups")
    .select("id, slug, name, tagline, industry, stage, funding_target, mrr, arr, growth_rate, runway_months, created_at, vaultrise_score, round_close_date")
    .eq("status", "active")
    // B16: a founder-paused round is off the market until they resume it.
    .neq("round_state", "paused")
    .eq("industry", industry)
    .order("created_at", { ascending: false })
    .limit(24)
    .returns<StartupCardData[]>();
  // The empty state below is a factual claim about the sector, and this page
  // is cached for an hour, so a failed read must not become one. Throwing
  // holds the last good render through a revalidation and fails the build
  // loudly rather than prerendering a sector as empty.
  if (error) throw new Error(`sector ${params.slug}: ${error.message}`);

  // This page is statically generated for anonymous crawlers and always passes
  // investorTier={null} to the card, so gated figures are never displayed
  // here. Null them so they are not shipped in the prerendered payload
  // either -- through the shared strip, because this page's own version
  // covered mrr and arr only and kept publishing growth and runway.
  const list = (startups ?? []).map((s) => stripCardFinancials(s));

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
