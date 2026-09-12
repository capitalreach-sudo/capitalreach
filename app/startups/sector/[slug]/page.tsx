import { notFound } from "next/navigation";
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
import { loadSectorTeaser } from "@/lib/sector-teaser";
import { STAGE_LABELS } from "@/lib/utils";
import { safeFormatCurrency } from "@/lib/format";
import { safeFormatTotal } from "@/lib/validators";

/**
 * Sector landing pages: /startups/sector/fintech and friends.
 *
 * Search traffic arrives by sector, not by brand -- nobody googles
 * "CapitalReach", but "fintech startups raising" is a real query. One page
 * per industry in the shared INDUSTRIES list, listing that sector's active
 * raises with an honest empty state that still gives a crawler and a founder
 * something to land on.
 *
 * The copy states what the page IS rather than puffing: these pages exist to
 * rank and convert, and thin superlatives do neither.
 *
 * Two audiences, one URL. Members get the full named cards. While the browse
 * index is members-only, an anonymous visitor (and Googlebot) gets the sector
 * TEASER instead of a login redirect: real aggregates and identity-masked
 * entries, computed in lib/sector-teaser. Nothing that identifies a company
 * reaches the anonymous payload -- see that file for the line and its
 * enforcement.
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
  // Indexable unconditionally. These pages briefly carried a noindex tied to
  // public_browse_index: while browse was members-only, an anonymous crawler
  // got twelve words of chrome, and twenty indexable empty pages is what
  // Google files as thin content. The anonymous branch now renders real
  // sector aggregates and identity-masked cards in that config state, so the
  // crawler gets substantive content either way and the guard came out.
  return {
    title: `${industry} startups raising capital`,
    description: `${industry} startups raising on CapitalReach: funding targets, traction and stage, with a 2% success fee paid by the startup only at close.`,
  };
}

// Shared label styles for the teaser figures.
const TEASER_LABEL: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em",
};

// i18n note: deliberately English-only. These are SEO landing pages written
// for a crawler rather than for a signed-in member, and the reason no longer
// has anything to do with rendering mode -- the page is dynamic now. Same
// policy as /blog.
export default async function SectorPage({ params }: Props) {
  const industry = industryFromSlug(params.slug);
  // 404 before the auth gate: an invalid sector is not a page, so it should
  // never answer a crawler (or anyone) with a login redirect.
  if (!industry) notFound();

  // Same rule as the index: a sector page is the catalogue, filtered. While
  // the catalogue is members-only, an anonymous visitor gets the teaser
  // branch below instead of a redirect -- the page always has real content.
  let anonymous = false;
  if (!(await browseIndexPublic())) {
    const gate = await createServerSupabaseClient();
    const { data: { user } } = await gate.auth.getUser();
    anonymous = !user;
  }

  // Throws on a failed read (inside loadSectorTeaser): the teaser makes
  // factual claims about the sector, and a database wobble must not render
  // as "0 active rounds".
  const teaser = anonymous ? await loadSectorTeaser(industry) : null;

  let list: StartupCardData[] = [];
  if (!anonymous) {
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
    // The list below is a factual claim about the sector, so a failed read
    // must not become an empty one. Throwing fails loudly instead of
    // rendering the sector as having no rounds.
    if (error) throw new Error(`sector ${params.slug}: ${error.message}`);

    // This page always passes investorTier={null} to the card, so gated
    // figures are never displayed here. Null them so they are not shipped in
    // the payload either -- through the shared strip, because this page's own
    // version covered mrr and arr only and kept publishing growth and runway.
    list = (startups ?? []).map((s) => stripCardFinancials(s));
  }

  const marketIsEmpty = anonymous ? teaser!.activeCount === 0 : list.length === 0;

  // One empty state for both audiences: with no active rounds there is
  // nothing to mask, so anonymous and member honestly see the same thing.
  const emptyState = (
    <div style={{ border: "1px dashed var(--cr-rule-dark)", borderRadius: "8px", background: "var(--cr-paper-2)", padding: "48px 24px", textAlign: "center" }}>
      <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "17px", color: "var(--cr-ink)", marginBottom: "8px" }}>
        No {industry} rounds are open right now
      </p>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", maxWidth: "44ch", margin: "0 auto 16px", lineHeight: 1.7 }}>
        Raising in {industry}? Listing is free during launch and every listing is
        reviewed before it goes live.
      </p>
      <Link href="/auth/signup?role=startup"
        style={{ display: "inline-flex", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", borderRadius: "4px", padding: "11px 24px", textDecoration: "none" }}>
        List your startup
      </Link>
    </div>
  );

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
          {anonymous ? (
            // The anonymous intro describes what this visitor actually gets:
            // live figures with the identities held for members. Claiming
            // "shown up front" over masked cards would be a lie.
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", maxWidth: "60ch", lineHeight: 1.7, marginBottom: "36px" }}>
              Live figures from the {industry} rounds currently raising on CapitalReach.
              Every listing was reviewed before going live; company identities are shown
              to members. The platform charges the startup a 2% success fee at close
              (investors pay nothing) and nothing before it.
            </p>
          ) : (
            <>
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
            </>
          )}

          {marketIsEmpty ? (
            emptyState
          ) : anonymous && teaser ? (
            <>
              {/* Sector snapshot: the same ledger-panel idiom as the homepage
                  data panel -- hairline grid, mono figures, no accent. The
                  one copper thing in this view is the sign-up CTA below. */}
              <section aria-label={`${industry} sector snapshot`} style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden", marginBottom: "24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", background: "var(--cr-rule)" }}>
                  {([
                    [String(teaser.activeCount), teaser.activeCount === 1 ? "Active round" : "Active rounds"],
                    [safeFormatTotal(teaser.totalRaise), "Being raised"],
                    [safeFormatCurrency(teaser.medianRaise), "Median raise"],
                  ] as Array<[string, string]>).map(([value, label]) => (
                    <div key={label} style={{ background: "var(--cr-paper-2)", padding: "16px" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "18px", color: "var(--cr-ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                        {value}
                      </div>
                      <div style={{ ...TEASER_LABEL, marginTop: "8px" }}>{label}</div>
                    </div>
                  ))}
                </div>
                {teaser.stages.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: "20px", rowGap: "8px", borderTop: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)", padding: "12px 16px" }}>
                    <span style={TEASER_LABEL}>By stage</span>
                    {teaser.stages.map(({ stage, count }) => (
                      <span key={stage} style={{ display: "inline-flex", alignItems: "baseline", gap: "8px" }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)" }}>
                          {STAGE_LABELS[stage] ?? stage.replace(/_/g, " ")}
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums" }}>
                          {count}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* Identity-masked entries. Deliberately NOT links: the detail
                  page is members-only, and a card that 302s a crawler to a
                  login screen is worse than a card that goes nowhere. The
                  raise figure stays ink rather than copper -- six accents in
                  a grid is a wash, and the CTA owns the accent here. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                {teaser.entries.map((e, i) => {
                  const location = e.city || e.country || null;
                  const meta = [industry, STAGE_LABELS[e.stage] ?? e.stage.replace(/_/g, " "), location]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    // Index as key: the masked payload carries no identifier
                    // on purpose, and a static list needs nothing better.
                    <div key={i} style={{ display: "flex", flexDirection: "column", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px" }}>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--cr-ink-3)", marginBottom: "12px" }}>
                        {meta}
                      </p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", color: "var(--cr-ink-2)", lineHeight: 1.6, flex: 1, marginBottom: "16px" }}>
                        {e.tagline}
                      </p>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", borderTop: "1px solid var(--cr-rule)", paddingTop: "12px" }}>
                        <div>
                          <div style={{ ...TEASER_LABEL, fontSize: "9px", letterSpacing: "0.07em", marginBottom: "3px" }}>Raising</div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums" }}>
                            {safeFormatCurrency(e.funding_target)}
                          </div>
                        </div>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textAlign: "right" }}>
                          Identity shown to members
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* The one CTA, phrased around the sector. Sign-up is the only
                  door the masked cards can honestly point at. */}
              <div style={{ marginTop: "48px", borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "32px", textAlign: "center" }}>
                <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "20px", color: "var(--cr-ink)", marginBottom: "8px" }}>
                  See the {industry} companies behind these rounds
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", maxWidth: "48ch", margin: "0 auto 16px", lineHeight: 1.7 }}>
                  A free account opens the live directory: company names, reviewed
                  profiles and every {industry} round on the platform.
                </p>
                <Link href="/auth/signup"
                  style={{ display: "inline-flex", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", borderRadius: "4px", padding: "11px 24px", textDecoration: "none" }}>
                  Create a free account
                </Link>
              </div>
            </>
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
