import { MetadataRoute } from "next";
import { headers } from "next/headers";
import { deploymentIndexable, requestHost } from "@/lib/indexing";

// Read at request time, not at build. This file's contents depend on a
// platform_config row, and Next prerenders it by default -- so a config read
// that fails during the build (no service key in that environment, a cold
// database) gets baked in and served for the life of the deployment. That is
// exactly what happened: the catalogue was gated but robots kept advertising
// it, because the build-time read failed open.
export const dynamic = "force-dynamic";
import { brand } from "@/lib/brand";
import { browseIndexPublic } from "@/lib/listing-visibility";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // A staging or preview deployment asks for nothing to be crawled and
  // advertises no sitemap, so it cannot compete with production in search.
  if (!deploymentIndexable(requestHost(headers()))) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
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
