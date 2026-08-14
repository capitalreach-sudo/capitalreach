/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // Guessed-URL courtesy: the real route is /auth/signup.
    return [{ source: "/auth/register", destination: "/auth/signup", permanent: true }];
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
    serverComponentsExternalPackages: ["@trigger.dev/sdk", "docusign-esign"],
  },
};

export default nextConfig;
