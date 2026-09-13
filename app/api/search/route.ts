import { NextRequest, NextResponse } from "next/server";
import { requireCatalogueAccess } from "@/lib/catalogue-guard";
import { createAdminClient } from "@/lib/supabase-server";
import { searchRatelimit } from "@/lib/redis";
import { clientIp } from "@/lib/client-ip";

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
  // The page redirects anonymous visitors; the data behind it must too.
  const gate = await requireCatalogueAccess();
  if (gate) return gate;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ startups: [], investors: [] });

  // Public endpoint over the whole directory -- without this it is the
  // cheapest way to scrape both listings. Degrades open when Redis is
  // unconfigured, like every other limiter here.
  const ip = clientIp(req.headers);
  // The mock limiter (no Redis) always succeeds, but a configured-but-transiently
  // -down Upstash makes .limit() REJECT, which would 500 this public path. Fail
  // open on error, consistent with the "degrades open" contract above.
  try {
    const { success } = await searchRatelimit.limit(`ip:${ip}`);
    if (!success) {
      return NextResponse.json({ startups: [], investors: [], limited: true }, { status: 429 });
    }
  } catch {
    // Redis unreachable: allow the request rather than failing a public read.
  }

  // PostgREST `.or()` is a comma/paren mini-language, and this query runs under
  // the SERVICE ROLE, so an unescaped comma or paren does not just change the
  // search terms -- it injects top-level conditions that reference columns the
  // client can never read (vaultrise_score, trust_level, owner_id...), turning
  // the search box into a boolean oracle over hidden values. The sibling `.or()`
  // routes (messages/accounts, admin/list) strip exactly these; this one is the
  // one that didn't. Strip the grammar chars first, then escape LIKE wildcards.
  const safeQ = q.replace(/[,()*\\%_]/g, " ").trim();
  if (safeQ.length < 2) return NextResponse.json({ startups: [], investors: [] });
  const term = `%${safeQ}%`;

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
            .neq("round_state", "paused")
            .textSearch("search_vector", ftsQuery, { type: "websearch", config: "simple" })
            .limit(5)
        : Promise.resolve({ data: [] as Array<{ name: string; slug: string; tagline: string; industry: string }> }),
      admin
        .from("startups")
        .select("name, slug, tagline, industry")
        .eq("status", "active")
            .neq("round_state", "paused")
        .or(`name.ilike.${term},tagline.ilike.${term}`)
        .limit(5),
      ftsQuery
        ? admin
            .from("investors")
            .select("slug, display_name, firm_name, type")
            // Service role, so RLS does not apply: reproduce the directory's own
            // visibility qual (migration 131: is_external=false AND is_public=
            // true). B18: off-platform contacts (is_external) are a founder's
            // private list; an unlisted profile (is_public=false, e.g. one an
            // admin removed) must not reappear by name through search.
            .eq("is_external", false)
            .eq("is_public", true)
            .textSearch("search_vector", ftsQuery, { type: "websearch", config: "simple" })
            .limit(5)
        : Promise.resolve({ data: [] as Array<{ slug: string; display_name: string | null; firm_name: string | null; type: string }> }),
      admin
        .from("investors")
        .select("slug, display_name, firm_name, type")
        .eq("is_external", false)
        .eq("is_public", true)
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
