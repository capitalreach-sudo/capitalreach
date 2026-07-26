import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { AiToolsHub } from "@/components/shared/ai-tools-hub";
import { LegalDisclaimer } from "@/components/shared/legal-disclaimer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Deal Intelligence",
  description:
    "Analyze startup pitches with GPT-4o-mini, find your best-fit investors instantly, and generate 500-word due diligence reports in seconds. Powered by real AI.",
};

export default function AiPage() {
  return (
    <>
      <Navbar />
      <AiToolsHub />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 48px" }}>
        <LegalDisclaimer variant="ai" />
      </div>
      <Footer />
    </>
  );
}
