import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DataCentre } from "@/components/shared/data-centre";
import { computePlatformData } from "@/lib/platform-data";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Centre",
  description: "Platform-wide analytics, industry breakdown, funding activity, and trending startups on CapitalReach.",
};

export default async function DataPage() {
  // Aggregates are computed on the server so the dashboard is in the HTML on
  // first paint — no "Loading platform data…". If the DB is unreachable the
  // client shows its retry state instead of a spinner that never resolves.
  const initial = await computePlatformData();
  return (
    <>
      <Navbar />
      <DataCentre initialData={initial} />
      <Footer />
    </>
  );
}
