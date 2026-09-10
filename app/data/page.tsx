import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { buildAccessContext, investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DataCentre } from "@/components/shared/data-centre";
import { computePlatformData } from "@/lib/platform-data";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Canonical: the app answers on more than one hostname (vercel.app plus
  // whatever domain it ends up on), and duplicate URLs split their own ranking.
  alternates: { canonical: "/data" },
  title: "Data Centre",
  description: "Platform-wide analytics, industry breakdown, funding activity, and trending startups on CapitalReach.",
};

export default async function DataPage() {
  // Signed in or nothing. A logged-out visitor gets the home page and no more,
  // and this one had no gate at all while naming five companies with their
  // industry, stage, score and funding target.
  const sb = await createServerSupabaseClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/data");

  let mayName = false;
  try {
    const { data: prof } = await createAdminClient()
      .from("profiles").select("id, role, subscription_tier, suspended, account_status")
      .eq("id", user.id).maybeSingle();
    if (prof) {
      const launch = await getLaunchStatus();
      const ctx = buildAccessContext(prof as Parameters<typeof buildAccessContext>[0], launch.isLaunch);
      mayName = prof.role === "admin" || prof.role === "startup"
        ? true
        : investorCan(ctx).viewListingDetail;
    }
  } catch { /* the aggregates still render; only the names are withheld */ }

  // Aggregates are computed on the server so the dashboard is in the HTML on
  // first paint — no "Loading platform data…". If the DB is unreachable the
  // client shows its retry state instead of a spinner that never resolves.
  const initial = await computePlatformData();

  // The numbers are the point of this page and every member may read them.
  // The two NAMED lists are advertisement, so they follow the same rule as the
  // homepage ticker, and they are emptied before serialisation rather than
  // hidden in the client.
  const data = mayName || !initial
    ? initial
    : { ...initial, topStartups: [], recentStartups: [] };

  return (
    <>
      <Navbar />
      <DataCentre initialData={data} />
      <Footer />
    </>
  );
}
