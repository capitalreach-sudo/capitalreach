import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { Deal, Profile } from "@/types";
import { buildAccessContext, canExportData, founderCan, isSuspended } from "@/lib/access";
import { resolveAdmin } from "@/lib/admin-guard";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DealsPortalClient } from "@/components/shared/deals-portal-client";
import { LegalDisclaimer } from "@/components/shared/legal-disclaimer";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

// One shell and one masthead for all three role views: same copy keys, same
// structure -- only the composition is shared. var(--font-serif) keeps the
// display face register-correct (the business style resolves it to the sans).
const MAIN: CSSProperties = { background: "var(--cr-paper)", minHeight: "60vh" };
const WRAP: CSSProperties = { maxWidth: "1200px", margin: "0 auto", padding: "96px 24px 64px" };
const H1: CSSProperties = {
  fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 700,
  fontSize: "clamp(30px,4vw,44px)", color: "var(--cr-ink)", letterSpacing: "-0.02em",
};

// The root template already appends "| CapitalReach", so the title carries
// no brand of its own.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    title: t("meta.dealsTitle"),
    description: t("meta.dealsDesc"),
  };
}

export default async function DealsPage() {
  const t = await getTranslator(getLocale());
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/deals");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()
    // The role/tier union narrowings are licensed by the DB CHECK constraints.
    .returns<Profile>();
  if (!profile) redirect("/auth/login?redirect=/deals");

  const { isLaunch } = await getLaunchStatus();
  const ctx = buildAccessContext(profile, isLaunch);

  // Suspended accounts cannot transact. RLS also blocks the writes, but bounce
  // them here so they get an explanation rather than silent failures.
  if (isSuspended(ctx)) redirect("/suspended");

  if (profile.role === "startup") {
    // Owner's own listing incl. financials: service role (column grants).
    const { data: startup } = await createAdminClient()
      .from("startups")
      .select("id, subscription_tier, funding_target, equity_offered, stage, industry, mrr, arr")
      .eq("owner_id", user.id)
      // A real account owns at most one startup, but plain .maybeSingle()
      // errors (and this destructure treats that as "no startup") if a row
      // ever duplicates -- order + limit(1) makes the earliest-created
      // listing win deterministically instead of failing closed. Same
      // defensive shape as app/dashboard/startup/page.tsx's owner-row lookup.
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!startup) redirect("/onboarding/startup");

    const { data: deals } = await supabase
      .from("deals")
      .select("*, investor:investors(slug, type, display_name, firm_name, is_external)")
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
        <Navbar initialProfile={profile} />
        <main style={MAIN}>
          <div style={WRAP}>
            <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("deals.portalLabel")}</div>
            <h1 style={{ ...H1, marginBottom: "32px" }}>
              {t("deals.yourDeals")}
            </h1>
            <DealsPortalClient
              deals={(deals ?? []) as Deal[]}
              viewAs="startup"
              revealIdentity={revealIdentity}
              equityOffered={startup.equity_offered}
              canExport
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
      // Same defensive shape as the startup branch above and
      // app/dashboard/startup/page.tsx: order + limit(1) so a duplicate row
      // resolves to the earliest one instead of erroring the whole lookup.
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!investor) redirect("/onboarding/investor");

    // A deal party sees the counterpart's financials on the board -- that
    // read now needs the service role (column grants); the investor_id
    // filter above scopes it exactly as the old RLS path did.
    const { data: deals } = await createAdminClient()
      .from("deals")
      .select("*, startup:startups(name, slug, equity_offered, funding_target, stage, industry, mrr, arr)")
      .eq("investor_id", investor.id)
      .order("updated_at", { ascending: false });

    const canExport = canExportData(ctx);

    return (
      <>
        <Navbar initialProfile={profile} />
        <main style={MAIN}>
          <div style={WRAP}>
            <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("deals.portalLabel")}</div>
            <h1 style={{ ...H1, marginBottom: "32px" }}>
              {t("deals.yourDeals")}
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
    // "Every deal across every startup and investor" was a promise this page
    // could not keep: there are no admin RLS policies on deals, so reading
    // through the admin's own session returned only the deals they personally
    // participate in -- an empty page on a platform with 42 of them. The read
    // has to bypass RLS, so the role is re-verified with the service role
    // rather than trusted from the session read above.
    const resolved = await resolveAdmin();
    if (!resolved.ok) redirect(resolved.reason === "suspended" ? "/suspended" : "/dashboard");

    const { data: deals } = await resolved.admin
      .from("deals")
      .select("*, startup:startups(name, slug, equity_offered, funding_target, stage, industry, mrr, arr), investor:investors(slug, type, display_name, firm_name, is_external)")
      // Demo deals outnumber real ones roughly 100 to 1 on this platform right
      // now, and they update_at-sort to the top like anything else -- real
      // rows first, then most-recent, so the 250-row cap below can never push
      // a real deal out in favour of demo ones. The client defaults to
      // real-only (DealsPortalClient's showDemo state) with an admin toggle
      // to see the rest, same default-real-rows rule the admin startup/
      // investor lists already apply -- fetched here in one round trip
      // rather than gated at the query, so switching the toggle is instant.
      .order("is_demo", { ascending: true })
      .order("updated_at", { ascending: false })
      // 250 most-recent: the board previews columns and the list paginates
      // visually anyway -- 500 rows of joined JSON was pure transfer weight.
      .limit(250);

    // The operator who is ALSO a participant (an admin with their own
    // investor or startup profile) needs two lenses on this page: the
    // platform ledger, and their own pipeline inside it. The ids of their
    // entities let the client offer the switch.
    const [{ data: myStartups }, { data: myInvestors }] = await Promise.all([
      resolved.admin.from("startups").select("id").eq("owner_id", user.id),
      resolved.admin.from("investors").select("id").eq("owner_id", user.id),
    ]);
    const myEntityIds = [
      ...(myStartups ?? []).map(r => r.id),
      ...(myInvestors ?? []).map(r => r.id),
    ];

    return (
      <>
        <Navbar initialProfile={profile} />
        <main style={MAIN}>
          <div style={WRAP}>
            <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("deals.portalLabel")}</div>
            <h1 style={{ ...H1, marginBottom: "8px" }}>
              {t("deals.allDeals")}
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)", maxWidth: "62ch", marginBottom: "32px" }}>
              {t("deals.adminSubtitle")}
            </p>
            <DealsPortalClient deals={(deals ?? []) as Deal[]} viewAs="admin" canExport myEntityIds={myEntityIds} />
            <LegalDisclaimer />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar initialProfile={profile} />
      <main style={{ ...MAIN, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ padding: "96px 24px", textAlign: "center" }}>
          <span aria-hidden style={{ display: "block", color: "var(--cr-copper)", fontSize: "14px", marginBottom: "12px" }}>✦</span>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)" }}>
            {t("deals.availableTo")}
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
