import { MetadataRoute } from "next";
import { SECTOR_SLUGS } from "@/lib/industry-slugs";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { createAdminClient } from "@/lib/supabase-server";
import { listingDetailPublic, browseIndexPublic } from "@/lib/listing-visibility";
import { brand } from "@/lib/brand";

export const revalidate = 3600; // Regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = brand.url;
  const supabase = createAdminClient();

  // Sample listings NEVER reach crawlers: a search result for a fictional
  // company is an SEO penalty and a trust incident in one. They stay on the
  // site (labeled), they stay out of the index.
  const { data: startups } = await supabase
    .from("startups")
    .select("slug, updated_at")
    .eq("status", "active")
    .eq("is_demo", false);

  // Only investors whose account is in good standing; a suspended investor's
  // profile shouldn't be advertised to crawlers. Joined through the owner
  // profile because suspension lives there, not on the investor row.
  const { data: investors } = await supabase
    .from("investors")
    .select("slug, created_at, owner:profiles!owner_id(suspended, account_status)")
    // B18: never advertise a founder's private off-platform contact.
    .eq("is_external", false)
    .eq("is_demo", false)
    .then((r) => ({
      data: (r.data ?? []).filter((i) => {
        const o = i.owner as { suspended?: boolean | null; account_status?: string | null } | null;
        return !o?.suspended && o?.account_status !== "suspended" && o?.account_status !== "banned";
      }),
    }));

  // Every publicly reachable route. Middleware gates only /dashboard,
  // /onboarding and /admin, so everything below is crawlable. /deals is
  // excluded even though middleware leaves it alone: the page itself
  // redirects anonymous visitors to login, and a sitemap URL that answers
  // with a redirect just erodes crawl trust.
  //
  // This previously listed four URLs and omitted ten, including /startups and
  // /investors -- the two browse pages, and the most valuable indexable pages
  // on the site after the homepage. Individual profiles were being submitted
  // with no listing page pointing at them.
  // Static marketing pages: a stable date, bumped when their content
  // meaningfully changes. Request-time stamps made every crawl look like a
  // full-site update, which teaches crawlers to distrust lastmod entirely.
  const staticLastMod = new Date("2026-08-14");
  // Typed so changeFrequency keeps its literal type through the .map below;
  // an untyped array literal widens it to string and no longer satisfies
  // MetadataRoute.Sitemap.
  const routes: Array<Omit<MetadataRoute.Sitemap[number], "lastModified">> = [
    { url: baseUrl,                  changeFrequency: "daily",   priority: 1.0 },
    { url: `${baseUrl}/startups`,    changeFrequency: "daily",   priority: 0.9 },
    { url: `${baseUrl}/pricing`,     changeFrequency: "weekly",  priority: 0.8 },
    { url: `${baseUrl}/ai`,          changeFrequency: "weekly",  priority: 0.7 },
    { url: `${baseUrl}/data`,        changeFrequency: "weekly",  priority: 0.6 },
    { url: `${baseUrl}/status`,      changeFrequency: "daily",   priority: 0.3 },
    // One landing page per sector -- search traffic arrives by sector, not
    // by brand, and these are the pages built to catch it.
    ...BLOG_POSTS.map(({ slug }) => ({
      url: `${baseUrl}/blog/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...SECTOR_SLUGS.map(({ slug }) => ({
      url: `${baseUrl}/startups/sector/${slug}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    { url: `${baseUrl}/about`,       changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/blog`,        changeFrequency: "weekly",  priority: 0.6 },
    { url: `${baseUrl}/auth/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/contact`,     changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/careers`,     changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/auth/login`,  changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/terms`,       changeFrequency: "yearly",  priority: 0.3 },
    { url: `${baseUrl}/privacy`,     changeFrequency: "yearly",  priority: 0.3 },
    { url: `${baseUrl}/disclaimer`,  changeFrequency: "yearly",  priority: 0.3 },
    { url: `${baseUrl}/imprint`,     changeFrequency: "yearly",  priority: 0.3 },
  ];
  const staticRoutes: MetadataRoute.Sitemap = routes.map(r => ({ ...r, lastModified: staticLastMod }));

  // Individual listings are submitted only while their detail pages are
  // readable without an account. Under "members" every one of these URLs
  // answers an anonymous crawler with a 307 to /auth/login, and a sitemap full
  // of redirects both burns crawl budget and gets sign-in pages indexed under
  // company names -- the same reason the investor profiles came out above.
  //
  // /startups and the sector pages STAY: the browse index is public either
  // way, and it is the page that ranks. Kept as a condition rather than
  // deleted so flipping the config back to "open" restores the entries with no
  // deploy.
  const detailPublic = await listingDetailPublic();
  const startupRoutes: MetadataRoute.Sitemap = !detailPublic ? [] : (startups || []).map(s => ({
    url: `${baseUrl}/startups/${s.slug}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: "daily" as const,
    priority: 0.9,
  }));

  // Investor pages are login-gated now (audit): a sitemap entry that 307s
  // to /auth/login is worse than no entry.
  const investorRoutes: MetadataRoute.Sitemap = ([] as typeof investors extends null ? never[] : NonNullable<typeof investors>).map(i => ({
    url: `${baseUrl}/investors/${i.slug}`,
    lastModified: new Date(i.created_at),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  // A sitemap entry that answers with a redirect to a sign-in page is worse
  // than no entry: it teaches a crawler that the URL is not content.
  const catalogueOpen = await browseIndexPublic();
  const publicStatic = catalogueOpen
    ? staticRoutes
    : staticRoutes.filter((r) => !r.url.includes("/startups"));

  return [...publicStatic, ...startupRoutes, ...investorRoutes];
}
