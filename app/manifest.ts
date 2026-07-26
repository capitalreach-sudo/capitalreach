import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CapitalReach — Startup Investment Marketplace",
    short_name: "CapitalReach",
    description:
      "Connect vetted early-stage startups with investors. Browse, filter, and fund the next generation of companies.",
    // Installed users are signed-in users, and a signed-in user lands on their
    // dashboard rather than the marketing homepage. /dashboard redirects by
    // role, and redirects anyone without a session to login, so it is the right
    // entry point for both cases.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F0E8", // --cr-paper
    theme_color: "#B5651D",      // --cr-copper
    categories: ["business", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops these to its own shape; they carry extra padding so the
      // mark survives the crop.
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
