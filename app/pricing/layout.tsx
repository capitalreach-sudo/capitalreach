import type { Metadata } from "next";
import { getStageStatus } from "@/lib/pricing-stage";

// /pricing is a client component, so its metadata lives here — a page marked
// "use client" cannot export the metadata object itself.
//
// Resolved per request from the same getStageStatus the hero renders from:
// the cohort size is admin-editable platform_config, so a description that
// wrote the number down went on promising 100 after the target became 150,
// and the search result then contradicted the headline it linked to.
export async function generateMetadata(): Promise<Metadata> {
  const { target } = await getStageStatus();
  return {
    title: "Pricing",
    description: `Free during launch for our first ${target} members. One 2% success fee on capital raised, paid by the startup receiving the investment — no upfront cost, and investors pay nothing.`,
    alternates: { canonical: "/pricing" },
  };
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
