import { Suspense } from "react";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { StartupsSearch } from "@/components/startup/startups-search";
import { LegalDisclaimer } from "@/components/shared/legal-disclaimer";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find Startups",
  description:
    "Browse vetted startups currently raising capital. Filter by industry, stage, MRR, AI score, and more.",
};

export default function StartupsPage() {
  return (
    <>
      <Navbar />
      <Suspense
        fallback={
          <div style={{ minHeight: "80vh", background: "var(--cr-paper)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>Loading startups…</p>
          </div>
        }
      >
        <StartupsSearch />
      </Suspense>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 48px" }}>
        <LegalDisclaimer />
      </div>
      <Footer />
    </>
  );
}
