import { Suspense } from "react";
import { redirect } from "next/navigation";
import { buildAccessContext, investorCan, isSuspended } from "@/lib/access";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { browseIndexPublic } from "@/lib/listing-visibility";
import { getLaunchStatus } from "@/lib/launchMode";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { StartupsSearch, StartupsDirectorySkeleton, type DirectoryViewer } from "@/components/startup/startups-search";
import { loadActiveStartups, stripBrowseFinancials } from "@/lib/browse-data";
import type { Metadata } from "next";
import { getLocale, getTranslator } from "@/lib/locale-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    // Canonical: the app answers on more than one hostname (vercel.app plus
    // whatever domain it ends up on), and duplicate URLs split their own ranking.
    alternates: { canonical: "/startups" },
    title: t("meta.startupsTitle"),
    description: t("meta.startupsDesc"),
  };
}

export default async function StartupsPage() {
  // What the viewer's plan allows, resolved here so the client renders gates
  // rather than deciding them. Signed out, everything is off.
  let viewer: DirectoryViewer = {
    role: null,
    canSeeFinancials: false,
    canSeeScore: false,
    savedSearches: false,
    advancedFilters: false,
    dataExport: false,
  };
  // Set inside the gate block below for a signed-in viewer; stays false for
  // an anonymous one, matching what viewerCanSeeFinancials() would resolve.
  let canSeeFinancials = false;

  // Signed out, the product is the home page, the pricing page and the data
  // centre. The catalogue names real companies that are raising, and a
  // private marketplace does not put that in front of the street.
  {
    const gate = await createServerSupabaseClient();
    const { data: { user } } = await gate.auth.getUser();
    if (!user && !(await browseIndexPublic())) redirect("/auth/login?redirect=/startups");
    // A suspended account is signed in, so every "is there a user" gate let it
    // straight through. INVESTOR_SUSPENDED sets browse:false and nothing was
    // reading it.
    if (user) {
      const { data: prof } = await createAdminClient()
        .from("profiles").select("id, role, subscription_tier, suspended, account_status")
        .eq("id", user.id).maybeSingle();
      const profile = prof as Parameters<typeof buildAccessContext>[0];
      if (profile && isSuspended(buildAccessContext(profile, false))) {
        redirect("/suspended");
      }
      if (profile) {
        const { isLaunch } = await getLaunchStatus();
        const caps = investorCan(buildAccessContext(profile, isLaunch));
        const role = profile.role === "investor" || profile.role === "startup" || profile.role === "admin"
          ? profile.role
          : null;
        // Same investorCan() call this block already made for the other caps
        // -- viewerCanSeeFinancials() used to be called again below and redid
        // getUser(), the profile fetch AND getLaunchStatus() a second time,
        // three more sequential round trips to a database that is a full
        // region away from where this route runs.
        canSeeFinancials = caps.viewFinancials;
        viewer = {
          role,
          canSeeFinancials,
          canSeeScore: caps.aiScore,
          savedSearches: caps.savedSearches,
          advancedFilters: caps.advancedFilters,
          dataExport: caps.dataExport,
        };
      }
    }
  }

  // Rows are fetched on the server so the page ships with its listings in
  // the HTML: no "Loading" first paint, crawlable, and instant on a cold
  // client. A failed load hands `undefined` down and the client fetches.
  // Gated financials are stripped from the payload for any viewer who has not
  // unlocked them before the rows are serialized to the browser.
  const loaded = await loadActiveStartups();
  const initial = loaded ? stripBrowseFinancials(loaded.rows, canSeeFinancials) : null;
  const marketTotal = loaded?.total ?? 0;
  return (
    <>
      <Navbar />
      <main style={{ backgroundColor: "var(--cr-paper)" }}>
        {/* The fallback is the live page's own frame and classes, so the
            streamed swap lands the real rows where the skeleton rows stood. */}
        <Suspense fallback={<StartupsDirectorySkeleton />}>
          {/* First page only: the full market serialized twice (HTML and RSC
              payload) made this route a 300KB document. The client tops up
              from the API. */}
          <StartupsSearch
            initialStartups={initial ? initial.slice(0, 48) : undefined}
            initialIsPartial={(initial?.length ?? 0) > 48}
            marketTotal={marketTotal}
            viewer={viewer}
          />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
