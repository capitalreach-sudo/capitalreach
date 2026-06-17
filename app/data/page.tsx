import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DataCentre } from "@/components/shared/data-centre";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Centre — CapitalReach",
  description: "Platform-wide analytics, industry breakdown, funding activity, and trending startups on CapitalReach.",
};

export default function DataPage() {
  return (
    <>
      <Navbar />
      <DataCentre />
      <Footer />
    </>
  );
}
