import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { buildAccessContext, investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DataCentre } from "@/components/shared/data-centre";
import { computePlatformData } from "@/lib/platform-data";
import type { Metadata } from "next";
import { getLocale, getTranslator } from "@/lib/locale-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  // The description promises only what always renders. English until the key
  // lands in messages/*.json: the translator returns the key when it is missing.
  const descKey = "meta.dataDescNoCloseRate";
  const description = t(descKey) === descKey
    ? "Rounds raising, listings by month and deal activity across CapitalReach."
    : t(descKey);
  return {
    // Canonical: the app answers on more than one hostname, and duplicate URLs
    // split their own ranking.
    alternates: { canonical: "/data" },
    title: t("meta.dataTitle"),
    description,
  };
}

export default async function DataPage() {
  // Signed in or nothing: a logged-out visitor gets the login page.
  const sb = await createServerSupabaseClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/data");

  // The aggregates are the same for every viewer and expensive to recompute
  // (two full-table walks via fetchAll); the homepage cached this class of
  // query for exactly this reason (60s of staleness is invisible on a report
  // page). Cached here too, and run in parallel with the per-viewer profile
  // lookup below rather than after it -- the two never depended on each
  // other, so awaiting them in sequence was one sequential round trip this
  // page never needed to pay.
  const cachedPlatformData = unstable_cache(
    () => computePlatformData(),
    ["data-centre-platform-data"], { revalidate: 60 },
  );

  let mayName = false;
  let canListRound = false;
  const [initial, profileResult] = await Promise.all([
    // Aggregates are computed on the server so the report is in the first
    // paint. If the DB is unreachable the client shows its retry state.
    cachedPlatformData(),
    (async () => {
      try {
        const admin = createAdminClient();
        const { data: prof } = await admin
          .from("profiles").select("id, role, subscription_tier, suspended, account_status")
          .eq("id", user.id).maybeSingle();
        if (!prof) return null;
        const launch = await getLaunchStatus();
        const ctx = buildAccessContext(prof as Parameters<typeof buildAccessContext>[0], launch.isLaunch);
        const canName = prof.role === "admin" || prof.role === "startup"
          ? true
          : investorCan(ctx).viewListingDetail;
        // The closing link is for a founder who has not listed yet. Any listing
        // row, in any status, means they already have a round to manage; a
        // failed count resolves to no link.
        let canList = false;
        if (prof.role === "startup") {
          const { count, error } = await admin
            .from("startups").select("id", { count: "exact", head: true })
            .eq("owner_id", user.id);
          canList = !error && count === 0;
        }
        return { canName, canList };
      } catch {
        // The aggregates still render; names stay withheld and no link shows.
        return null;
      }
    })(),
  ]);
  if (profileResult) {
    mayName = profileResult.canName;
    canListRound = profileResult.canList;
  }

  // The two NAMED lists follow the homepage ticker's rule and are emptied
  // before serialisation, never hidden in the client.
  const data = mayName || !initial
    ? initial
    : { ...initial, topStartups: [], recentStartups: [] };

  return (
    <>
      <Navbar />
      <DataCentre initialData={data} canListRound={canListRound} />
      <Footer />
    </>
  );
}
