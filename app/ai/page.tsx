import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { AiToolsHub } from "@/components/shared/ai-tools-hub";
import { LegalDisclaimer } from "@/components/shared/legal-disclaimer";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Deal Intelligence",
  description:
    "Analyze startup pitches with GPT-4o-mini, find your best-fit investors instantly, and generate 500-word due diligence reports in seconds. Powered by real AI.",
};

export default async function AiPage() {
  // Auth is decided on the server so the HTML a signed-out visitor receives
  // is the sign-in gate — never a tool form that can only be refused. The
  // client re-checks too, but the first paint is already correct.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <>
      <Navbar />
      <AiToolsHub initialAuthed={!!user} />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 48px" }}>
        <LegalDisclaimer variant="ai" />
      </div>
      <Footer />
    </>
  );
}
