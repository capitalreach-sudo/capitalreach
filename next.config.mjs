/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gzip/brotli on by default in Next, stated explicitly so it can't be lost.
  compress: true,
  // React strict mode surfaces double-effect bugs in dev; harmless in prod.
  reactStrictMode: true,
  // Security headers live in vercel.json (single source, applied at the
  // edge). Nothing here duplicates them so they cannot drift.
  async redirects() {
    // Guessed-URL courtesy: the real route is /auth/signup.
    return [
      { source: "/auth/register", destination: "/auth/signup", permanent: true },
      // /stats duplicated the Data Centre; edge-level 308 so it costs no function.
      { source: "/stats", destination: "/data", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  experimental: {
    // pdf-parse ships CJS + a test fixture; bundling it breaks the import.
    serverComponentsExternalPackages: ["@trigger.dev/sdk", "docusign-esign", "pdf-parse"],
  },
};

export default nextConfig;
