import type { Metadata } from "next";

// /pricing is a client component, so its metadata lives here — a page marked
// "use client" cannot export the metadata object itself.
export const metadata: Metadata = {
  title: "Pricing",
  description: "Free during launch for our first 100 members. One 2% success fee on capital raised — no upfront cost for startups, and investors pay nothing.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
