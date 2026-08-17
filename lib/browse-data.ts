import { createAdminClient } from "@/lib/supabase-server";

/**
 * Server-side loaders for the two public directories and the data centre.
 *
 * The browse pages are client components (their filter state lives in the
 * URL and in React), but their FIRST paint no longer waits on a client fetch:
 * the server page calls one of these, hands the rows in as `initial*`, and
 * the component renders complete HTML. The client then only re-fetches when
 * something changes. One query definition, shared with the JSON API routes,
 * so the server render and the client refresh can never disagree.
 */

export const STARTUP_LIST_COLUMNS =
  "id,slug,name,tagline,industry,stage,funding_target,mrr,arr,growth_rate,runway_months,created_at,updated_at,vaultrise_score,country,business_model,round_close_date,demo_video_url,founded_year,verified_at,round_state";

export type BrowseStartup = {
  id: string; slug: string; name: string; tagline: string;
  industry: string; stage: string; funding_target: number;
  mrr: number | null; arr: number | null; growth_rate: number | null;
  runway_months: number | null; created_at: string; updated_at: string;
  vaultrise_score: number | null;
  country: string | null; business_model: string | null; round_close_date: string | null;
  demo_video_url: string | null; founded_year: number | null; verified_at: string | null;
  round_state?: string | null;
};

export async function loadActiveStartups(): Promise<BrowseStartup[] | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("startups")
      .select(STARTUP_LIST_COLUMNS)
      .eq("status", "active")
      // B16: a founder-paused round is off the market until they resume it.
      .neq("round_state", "paused")
      .order("created_at", { ascending: false });
    if (error) return null;
    return (data ?? []) as unknown as BrowseStartup[];
  } catch {
    return null;
  }
}

export type BrowseInvestor = {
  id: string; slug: string; type: string; bio: string | null;
  industries: string[]; stages: string[];
  min_check: number | null; max_check: number | null;
  geography: string[]; subscription_tier: string | null;
  verified_at: string | null; lead_rounds: boolean;
  number_of_investments: number | null; created_at: string;
  full_name: string | null; firm: string | null;
};

/**
 * Directory rows. Names come from investors.display_name — the profiles
 * table is not publicly readable (migration 019), so joining it from an
 * anonymous session yields nothing; display_name is the field investors
 * chose to publish. Rows with is_public = false are excluded.
 */
export async function loadPublicInvestors(): Promise<BrowseInvestor[] | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("investors")
      .select("id, slug, type, bio, industries, stages, min_check, max_check, geography, subscription_tier, verified_at, lead_rounds, number_of_investments, created_at, display_name, firm_name, is_public")
      .eq("is_public", true)
      .order("created_at", { ascending: false });
    if (error) return null;
    return (data ?? []).map((inv) => ({
      id: inv.id,
      slug: inv.slug,
      type: inv.type || "angel",
      bio: inv.bio,
      industries: inv.industries || [],
      stages: inv.stages || [],
      min_check: inv.min_check,
      max_check: inv.max_check,
      geography: inv.geography || [],
      subscription_tier: inv.subscription_tier,
      verified_at: inv.verified_at ?? null,
      lead_rounds: !!inv.lead_rounds,
      number_of_investments: inv.number_of_investments ?? null,
      created_at: inv.created_at,
      full_name: inv.display_name || null,
      firm: inv.firm_name || null,
    }));
  } catch {
    return null;
  }
}
