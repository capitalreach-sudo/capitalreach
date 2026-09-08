import { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = brand.url;
  return {
    rules: [
      {
        userAgent: "*",
        // /investors is login-gated now: inviting crawlers into a redirect
        // wastes crawl budget and indexes a sign-in page under a directory name.
        allow: ["/", "/startups/", "/pricing"],
        disallow: ["/dashboard/", "/admin/", "/api/", "/auth/", "/onboarding/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
