import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://capitalreach.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/startups/", "/investors/", "/pricing"],
        disallow: ["/dashboard/", "/admin/", "/api/", "/auth/", "/onboarding/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
