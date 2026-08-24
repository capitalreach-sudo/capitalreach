import { Suspense } from "react";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { StartupsSearch } from "@/components/startup/startups-search";
import { LegalDisclaimer } from "@/components/shared/legal-disclaimer";
import { loadActiveStartups } from "@/lib/browse-data";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Canonical: the app answers on more than one hostname (vercel.app plus
  // whatever domain it ends up on), and duplicate URLs split their own ranking.
  alternates: { canonical: "/startups" },
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
        {/* First page only: 103 full listings serialized twice (HTML + RSC
            payload) made this route a 300KB document. 48 rows cover two
            pages of the grid; the client tops up from the cached API. */}
        <StartupsSearch initialStartups={initial ? initial.slice(0, 48) : undefined} initialIsPartial={(initial?.length ?? 0) > 48} />
      </Suspense>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 48px" }}>
        <LegalDisclaimer />
      </div>
      <Footer />
    </>
  );
}
