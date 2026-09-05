import { Suspense } from "react";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { StartupsSearch } from "@/components/startup/startups-search";
import { LegalDisclaimer } from "@/components/shared/legal-disclaimer";
import { loadActiveStartups, stripBrowseFinancials, viewerCanSeeFinancials } from "@/lib/browse-data";
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
  // the HTML: no "Loading" first paint, crawlable, and instant on a cold
  // client. A failed load hands `undefined` down and the client fetches.
  // MRR/ARR are gated, so they are stripped from the payload for any viewer who
  // has not unlocked financials before the rows are serialized to the browser.
  const canSeeFinancials = await viewerCanSeeFinancials();
  const loaded = await loadActiveStartups();
  const initial = loaded ? stripBrowseFinancials(loaded.rows, canSeeFinancials) : null;
  const marketTotal = loaded?.total ?? 0;
  return (
    <>
      <Navbar />
      <Suspense
        fallback={
          /* The fallback at the page's TRUE geometry: header line, toolbar
             bar, and a grid of card frames at real card height. The old
             empty 80vh box swapped for a ~3000px page and threw everything
             below it across the viewport -- measured CLS 0.48 on mobile.
             Quiet frames in the right places make the swap invisible. */
          <div aria-busy="true" style={{ background: "var(--cr-paper)" }}>
            <div className="px-6 md:px-10 lg:px-20" style={{ maxWidth: "1280px", margin: "0 auto", paddingTop: "32px", paddingBottom: "64px" }}>
              <div style={{ height: "34px", width: "min(340px, 70%)", background: "var(--cr-paper-3)", borderRadius: "4px", marginBottom: "18px" }} />
              <div style={{ height: "44px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", marginBottom: "24px" }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} style={{ height: "224px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px" }} />
                ))}
              </div>
            </div>
          </div>
        }
      >
        {/* First page only: 103 full listings serialized twice (HTML + RSC
            payload) made this route a 300KB document. 48 rows cover two
            pages of the grid; the client tops up from the cached API. */}
        <StartupsSearch initialStartups={initial ? initial.slice(0, 48) : undefined} initialIsPartial={(initial?.length ?? 0) > 48} marketTotal={marketTotal} />
      </Suspense>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 48px" }}>
        <LegalDisclaimer />
      </div>
      <Footer />
    </>
  );
}
