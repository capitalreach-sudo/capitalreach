import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase-server";
import { brand } from "@/lib/brand";

export const revalidate = 3600; // Regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = brand.url;
  const supabase = createAdminClient();

  const { data: startups } = await supabase
    .from("startups")
    .select("slug, updated_at")
    .eq("status", "active");

  const { data: investors } = await supabase
    .from("investors")
    .select("slug, created_at");

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
  const now = new Date();
  // Typed so changeFrequency keeps its literal type through the .map below;
  // an untyped array literal widens it to string and no longer satisfies
  // MetadataRoute.Sitemap.
  const routes: Array<Omit<MetadataRoute.Sitemap[number], "lastModified">> = [
    { url: baseUrl,                  changeFrequency: "daily",   priority: 1.0 },
    { url: `${baseUrl}/startups`,    changeFrequency: "daily",   priority: 0.9 },
    { url: `${baseUrl}/investors`,   changeFrequency: "daily",   priority: 0.8 },
    { url: `${baseUrl}/pricing`,     changeFrequency: "weekly",  priority: 0.8 },
    { url: `${baseUrl}/ai`,          changeFrequency: "weekly",  priority: 0.7 },
    { url: `${baseUrl}/data`,        changeFrequency: "weekly",  priority: 0.6 },
    { url: `${baseUrl}/about`,       changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/blog`,        changeFrequency: "weekly",  priority: 0.6 },
    { url: `${baseUrl}/auth/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/contact`,     changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/careers`,     changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/auth/login`,  changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/terms`,       changeFrequency: "yearly",  priority: 0.3 },
    { url: `${baseUrl}/privacy`,     changeFrequency: "yearly",  priority: 0.3 },
    { url: `${baseUrl}/disclaimer`,  changeFrequency: "yearly",  priority: 0.3 },
  ];
  const staticRoutes: MetadataRoute.Sitemap = routes.map(r => ({ ...r, lastModified: now }));

  const startupRoutes: MetadataRoute.Sitemap = (startups || []).map(s => ({
    url: `${baseUrl}/startups/${s.slug}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: "daily" as const,
    priority: 0.9,
  }));

  const investorRoutes: MetadataRoute.Sitemap = (investors || []).map(i => ({
    url: `${baseUrl}/investors/${i.slug}`,
    lastModified: new Date(i.created_at),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...startupRoutes, ...investorRoutes];
}
