import { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { browseIndexPublic } from "@/lib/listing-visibility";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = brand.url;
  // When the catalogue is members-only there is nothing behind /startups for
  // a crawler to read, so allowing it only spends crawl budget on redirects
  // to a sign-in page. The public face is then the home page, pricing and
  // the data centre.
  const catalogueOpen = await browseIndexPublic();
  return {
    rules: [
      {
        userAgent: "*",
        // /investors is login-gated now: inviting crawlers into a redirect
        // wastes crawl budget and indexes a sign-in page under a directory name.
        allow: catalogueOpen ? ["/", "/startups/", "/pricing", "/data"] : ["/", "/pricing", "/data"],
        disallow: ["/dashboard/", "/admin/", "/api/", "/auth/", "/onboarding/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
