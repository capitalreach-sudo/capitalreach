import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { InvestorsClient } from "@/components/investors/investors-client";
import { loadPublicInvestors } from "@/lib/browse-data";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { buildAccessContext, isSuspended } from "@/lib/access";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Canonical: the app answers on more than one hostname (vercel.app plus
  // whatever domain it ends up on), and duplicate URLs split their own ranking.
  alternates: { canonical: "/investors" },
  title: "Investor Directory",
  description: "Browse accredited angels, VCs, and institutional investors actively looking to fund startups on CapitalReach.",
};

export default async function InvestorsPage() {
  // The directory names real people and their check sizes. Jack's call:
  // signed-in users only -- anonymous visitors browse startups, not backers.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/investors");
  {
    // Signed in is not the same as in good standing.
    const { data: prof } = await createAdminClient()
      .from("profiles").select("id, role, subscription_tier, suspended, account_status")
      .eq("id", user.id).maybeSingle();
    if (prof && isSuspended(buildAccessContext(prof as Parameters<typeof buildAccessContext>[0], false))) {
      redirect("/suspended");
    }
  }

  // Server-fetched so the directory is in the HTML on first paint (no
  // "Loading investors…"); the client only fetches if this returns null.
  const initial = await loadPublicInvestors();
  return (
    <>
      <Navbar />
      {/* First screenfuls only: at scale (10k+ rows) the full directory was a
          600 KB payload serialized into every visit. `initialIsPartial` is
          what tells the client to top up -- without it the directory stopped
          at these 60 rows for good, with no count to say so. */}
      <InvestorsClient
        initialInvestors={initial ? initial.slice(0, 60) : undefined}
        initialIsPartial={(initial?.length ?? 0) > 60}
      />
      <Footer />
    </>
  );
}
