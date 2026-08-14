import type { Metadata } from "next";

// Onboarding pages are client components; metadata lives here. Noindex —
// these are mid-signup states, meaningless as search results.
export const metadata: Metadata = {
  title: "Onboarding",
  robots: { index: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
