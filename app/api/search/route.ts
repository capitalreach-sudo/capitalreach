import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { searchRatelimit } from "@/lib/redis";

export const revalidate = 0;

/**
 * Global search: active startups and listed investors by name.
 *
 * Only fields that are already public on the browse pages are returned --
 * this route exposes nothing an anonymous visitor couldn't read from
 * /startups and /investors, it just makes both reachable from one box.
 * The ilike queries ride the trigram indexes from migration 013.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ startups: [], investors: [] });

  // Public endpoint over the whole directory -- without this it is the
  // cheapest way to scrape both listings. Degrades open when Redis is
  // unconfigured, like every other limiter here.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = await searchRatelimit.limit(`ip:${ip}`);
  if (!success) {
    return NextResponse.json({ startups: [], investors: [], limited: true }, { status: 429 });
  }

  // Escape the LIKE metacharacters so a query of "50%" matches the text
  // "50%" rather than acting as a wildcard. Still used for the prefix pass:
  // full-text matches whole lexemes, so "sch" would never find "Schokoheini".
  const term = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  // websearch_to_tsquery accepts what people actually type (quotes, OR, -)
  // without throwing on syntax the way plainto/to_tsquery can.
  const ftsQuery = q.replace(/[():&|!*']/g, " ").trim();

  const admin = createAdminClient();
  const [{ data: ftsStartups }, { data: likeStartups }, { data: ftsInvestors }, { data: likeInvestors }] =
    await Promise.all([
      // Full text first (migration 043): matches problem/solution/industry
      // prose, not just the name, and rides a GIN index instead of scanning.
      ftsQuery
        ? admin
            .from("startups")
            .select("name, slug, tagline, industry")
            .eq("status", "active")
            .textSearch("search_vector", ftsQuery, { type: "websearch", config: "simple" })
            .limit(5)
        : Promise.resolve({ data: [] as Array<{ name: string; slug: string; tagline: string; industry: string }> }),
      admin
        .from("startups")
        .select("name, slug, tagline, industry")
        .eq("status", "active")
        .or(`name.ilike.${term},tagline.ilike.${term}`)
        .limit(5),
      ftsQuery
        ? admin
            .from("investors")
            .select("slug, display_name, firm_name, type")
            // B18: off-platform contacts are a founder's private list. This
            // route runs as the service role, so RLS does not exclude them.
            .eq("is_external", false)
            .textSearch("search_vector", ftsQuery, { type: "websearch", config: "simple" })
            .limit(5)
        : Promise.resolve({ data: [] as Array<{ slug: string; display_name: string | null; firm_name: string | null; type: string }> }),
      admin
        .from("investors")
        .select("slug, display_name, firm_name, type")
        .eq("is_external", false)
        .or(`display_name.ilike.${term},firm_name.ilike.${term}`)
        .limit(5),
    ]);

  // Full-text hits rank first (they matched meaning), prefix hits fill in
  // (they matched what is still being typed); deduped by slug.
  const dedupe = <T extends { slug: string }>(a: T[] | null, b: T[] | null): T[] => {
    const seen = new Set<string>();
    return [...(a ?? []), ...(b ?? [])].filter((x) => !seen.has(x.slug) && seen.add(x.slug)).slice(0, 5);
  };
  const startups  = dedupe(ftsStartups, likeStartups);
  const investors = dedupe(ftsInvestors, likeInvestors);

  return NextResponse.json(
    {
      startups: startups ?? [],
      investors: (investors ?? []).map((i) => ({
        slug: i.slug,
        name: i.display_name || i.firm_name || i.slug,
        firm: i.firm_name,
        type: i.type,
      })),
    },
    // Public data over a hot path: let the edge absorb repeat queries.
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
