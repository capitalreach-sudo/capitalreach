import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase-server";

export const revalidate = 3600; // Regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://capitalreach.com";
  const supabase = createAdminClient();

  const { data: startups } = await supabase
    .from("startups")
    .select("slug, updated_at")
    .eq("status", "active");

  const { data: investors } = await supabase
    .from("investors")
    .select("slug, created_at");

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/pricing`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/auth/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/auth/signup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  ];

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
