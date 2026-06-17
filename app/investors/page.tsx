import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { InvestorsClient } from "@/components/investors/investors-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Investor Directory — CapitalReach",
  description: "Browse accredited angels, VCs, and institutional investors actively looking to fund startups on CapitalReach.",
};

export default function InvestorsPage() {
  return (
    <>
      <Navbar />
      <InvestorsClient />
      <Footer />
    </>
  );
}
