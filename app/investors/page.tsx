import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { InvestorsClient } from "@/components/investors/investors-client";
import { loadPublicInvestors } from "@/lib/browse-data";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Canonical: the app answers on more than one hostname (vercel.app plus
  // whatever domain it ends up on), and duplicate URLs split their own ranking.
  alternates: { canonical: "/investors" },
  title: "Investor Directory",
  description: "Browse accredited angels, VCs, and institutional investors actively looking to fund startups on CapitalReach.",
};

export default async function InvestorsPage() {
  // Server-fetched so the directory is in the HTML on first paint (no
  // "Loading investors…"); the client only fetches if this returns null.
  const initial = await loadPublicInvestors();
  return (
    <>
      <Navbar />
      <InvestorsClient initialInvestors={initial ?? undefined} />
      <Footer />
    </>
  );
}
