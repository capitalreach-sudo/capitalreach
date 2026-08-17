import { Suspense } from "react";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { StartupsSearch } from "@/components/startup/startups-search";
import { LegalDisclaimer } from "@/components/shared/legal-disclaimer";
import { loadActiveStartups } from "@/lib/browse-data";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find Startups",
  description:
    "Browse vetted startups currently raising capital. Filter by industry, stage, MRR, AI score, and more.",
};

export default async function StartupsPage() {
  // Rows are fetched on the server so the page ships with its listings in
  // the HTML: no "Loading…" first paint, crawlable, and instant on a cold
  // client. A failed load hands `undefined` down and the client fetches.
  const initial = await loadActiveStartups();
  return (
    <>
      <Navbar />
      <Suspense
        fallback={
          <div style={{ minHeight: "80vh", background: "var(--cr-paper)" }} aria-busy="true" />
        }
      >
        <StartupsSearch initialStartups={initial ?? undefined} />
      </Suspense>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 48px" }}>
        <LegalDisclaimer />
      </div>
      <Footer />
    </>
  );
}
