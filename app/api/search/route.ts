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
  // "50%" rather than acting as a wildcard.
  const term = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  const admin = createAdminClient();
  const [{ data: startups }, { data: investors }] = await Promise.all([
    admin
      .from("startups")
      .select("name, slug, tagline, industry")
      .eq("status", "active")
      .or(`name.ilike.${term},tagline.ilike.${term}`)
      .limit(5),
    admin
      .from("investors")
      .select("slug, display_name, firm_name, type")
      .or(`display_name.ilike.${term},firm_name.ilike.${term}`)
      .limit(5),
  ]);

  return NextResponse.json({
    startups: startups ?? [],
    investors: (investors ?? []).map((i) => ({
      slug: i.slug,
      name: i.display_name || i.firm_name || i.slug,
      firm: i.firm_name,
      type: i.type,
    })),
  });
}
