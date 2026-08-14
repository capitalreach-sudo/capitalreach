import type { Metadata } from "next";

// The auth pages are client components, so their metadata lives here.
// Sign-in flows have no business in a search index.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
