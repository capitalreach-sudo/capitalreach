import type { Metadata } from "next";

// The auth pages are client components, so their metadata lives here.
// Sign-in flows have no business in a search index.
// A nested layout's plain-string title would replace the root template, so
// the brand suffix is restated here: every auth tab reads "... | CapitalReach".
export const metadata: Metadata = {
  title: { template: "%s | CapitalReach", default: "Sign in" },
  robots: { index: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
