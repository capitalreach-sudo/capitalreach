import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DealsPortalClient } from "@/components/shared/deals-portal-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deal Portal — CapitalReach",
  description: "Start new deals, track them through every stage, and draft contracts against them.",
};

export default async function DealsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/deals");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/auth/login?redirect=/deals");

  if (profile.role === "startup") {
    const { data: startup } = await supabase.from("startups").select("id, subscription_tier").eq("owner_id", user.id).maybeSingle();
    if (!startup) redirect("/onboarding/startup");

    const { data: deals } = await supabase
      .from("deals")
      .select("*, investor:investors(slug, type, display_name, firm_name)")
      .eq("startup_id", startup.id)
      .order("updated_at", { ascending: false });

    const { isLaunch } = await getLaunchStatus();
    const tier = startup.subscription_tier || "free";
    const revealIdentity = isLaunch || tier === "starter" || tier === "growth";

    return (
      <>
        <Navbar />
        <main style={{ background: "var(--cr-paper)", minHeight: "60vh" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 24px 64px" }}>
            <div className="ruled-label" style={{ marginBottom: "16px" }}>Deal Portal</div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(28px,4vw,44px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "32px" }}>
              Your deals
            </h1>
            <DealsPortalClient deals={deals ?? []} viewAs="startup" revealIdentity={revealIdentity} />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (profile.role === "investor") {
    const { data: investor } = await supabase.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
    if (!investor) redirect("/onboarding/investor");

    const { data: deals } = await supabase
      .from("deals")
      .select("*, startup:startups(name, slug)")
      .eq("investor_id", investor.id)
      .order("updated_at", { ascending: false });

    return (
      <>
        <Navbar />
        <main style={{ background: "var(--cr-paper)", minHeight: "60vh" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 24px 64px" }}>
            <div className="ruled-label" style={{ marginBottom: "16px" }}>Deal Portal</div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(28px,4vw,44px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "32px" }}>
              Your deals
            </h1>
            <DealsPortalClient deals={deals ?? []} viewAs="investor" />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", padding: "100px 24px" }}>
          The Deal Portal is available to startup and investor accounts.
        </p>
      </main>
      <Footer />
    </>
  );
}
