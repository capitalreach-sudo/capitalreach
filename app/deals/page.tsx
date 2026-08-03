import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";
import type { Deal } from "@/types";
import { buildAccessContext, canExportData, founderCan, isSuspended } from "@/lib/access";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DealsPortalClient } from "@/components/shared/deals-portal-client";
import { LegalDisclaimer } from "@/components/shared/legal-disclaimer";
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

  const { isLaunch } = await getLaunchStatus();
  const ctx = buildAccessContext(profile, isLaunch);

  // Suspended accounts cannot transact. RLS also blocks the writes, but bounce
  // them here so they get an explanation rather than silent failures.
  if (isSuspended(ctx)) redirect("/suspended");

  if (profile.role === "startup") {
    const { data: startup } = await supabase
      .from("startups")
      .select("id, subscription_tier, funding_target, equity_offered, stage, industry, mrr, arr")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!startup) redirect("/onboarding/startup");

    const { data: deals } = await supabase
      .from("deals")
      .select("*, investor:investors(slug, type, display_name, firm_name)")
      .eq("startup_id", startup.id)
      .order("updated_at", { ascending: false });

    // Identity reveal is a plan feature, so read it from the founder's plan
    // rather than re-deriving the tier list here (it drifts otherwise).
    // The startup's own tier governs, not the owner profile's.
    const revealIdentity = founderCan({
      ...ctx,
      tier: startup.subscription_tier,
    }).seeInvestorIdentity;

    return (
      <>
        <Navbar />
        <main style={{ background: "var(--cr-paper)", minHeight: "60vh" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 24px 64px" }}>
            <div className="ruled-label" style={{ marginBottom: "16px" }}>Deal Portal</div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(28px,4vw,44px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "32px" }}>
              Your deals
            </h1>
            <DealsPortalClient
              deals={(deals ?? []) as Deal[]}
              viewAs="startup"
              revealIdentity={revealIdentity}
              equityOffered={startup.equity_offered}
              ownProfile={{
                kind: "startup",
                fundingTarget: startup.funding_target,
                stage: startup.stage,
                industry: startup.industry,
                mrr: startup.mrr,
                arr: startup.arr,
              }}
            />
            <LegalDisclaimer />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (profile.role === "investor") {
    const { data: investor } = await supabase
      .from("investors")
      .select("id, min_check, max_check, stages, industries")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!investor) redirect("/onboarding/investor");

    const { data: deals } = await supabase
      .from("deals")
      .select("*, startup:startups(name, slug, equity_offered, funding_target, stage, industry, mrr, arr)")
      .eq("investor_id", investor.id)
      .order("updated_at", { ascending: false });

    const canExport = canExportData(ctx);

    return (
      <>
        <Navbar />
        <main style={{ background: "var(--cr-paper)", minHeight: "60vh" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 24px 64px" }}>
            <div className="ruled-label" style={{ marginBottom: "16px" }}>Deal Portal</div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(28px,4vw,44px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "32px" }}>
              Your deals
            </h1>
            <DealsPortalClient
              deals={(deals ?? []) as Deal[]}
              viewAs="investor"
              canExport={canExport}
              ownProfile={{
                kind: "investor",
                minCheck: investor.min_check,
                maxCheck: investor.max_check,
                stages: investor.stages,
                industries: investor.industries,
              }}
            />
            <LegalDisclaimer />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (profile.role === "admin") {
    const { data: deals } = await supabase
      .from("deals")
      .select("*, startup:startups(name, slug, equity_offered, funding_target, stage, industry, mrr, arr), investor:investors(slug, type, display_name, firm_name)")
      .order("updated_at", { ascending: false });

    return (
      <>
        <Navbar />
        <main style={{ background: "var(--cr-paper)", minHeight: "60vh" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 24px 64px" }}>
            <div className="ruled-label" style={{ marginBottom: "16px" }}>Deal Portal</div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(28px,4vw,44px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "8px" }}>
              All deals
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)", marginBottom: "32px" }}>
              Platform-wide oversight — every deal across every startup and investor.
            </p>
            <DealsPortalClient deals={(deals ?? []) as Deal[]} viewAs="admin" canExport />
            <LegalDisclaimer />
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
          The Deal Portal is available to startup, investor, and admin accounts.
        </p>
      </main>
      <Footer />
    </>
  );
}
