import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { AiToolsHub } from "@/components/shared/ai-tools-hub";
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
      <Footer />
    </>
  );
}
