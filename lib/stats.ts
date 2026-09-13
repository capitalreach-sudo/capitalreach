import { createAdminClient } from "@/lib/supabase-server";

export type PlatformStats = {
  startupCount:     number;
  investorCount:    number;
  totalRaised:      number;
  dealsClosedCount: number;
};

const FLOOR: PlatformStats = {
  startupCount:     0,
  investorCount:    0,
  totalRaised:      0,
  dealsClosedCount: 0,
};

// supabase param is optional — caller can pass its own client to avoid
// duplicate instantiation; falls back to creating a fresh server client.
export async function getPlatformStats(supabase?: any): Promise<PlatformStats> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!supabaseUrl || supabaseUrl.includes("placeholder")) return FLOOR;

  try {
    const db = supabase ?? createAdminClient();

    // Sample rows stay OUT of every public headline. The browse page labels
    // them, /data footnotes them, the sector pages exclude them -- but these
    // numbers counted the whole seed, so the homepage claimed 103 startups
    // and $1.7M raised beside a "4/150 members" launch pill. Honest small
    // numbers plus the launch pill is one coherent story; inflated ones next
    // to it are two contradictory ones.
    const [startups, investors, deals] = await Promise.all([
      db
        .from("startups")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .eq("is_demo", false),
      // Count investor ENTITIES, not profiles-by-role: profiles carry no
      // is_demo flag, investors do (and external contacts are a founder's
      // private list, not members).
      db
        .from("investors")
        .select("*", { count: "exact", head: true })
        .eq("is_external", false)
        .eq("is_demo", false),
      // Deals carry no flag of their own; a deal is sample iff its startup is.
      db
        .from("deals")
        .select("amount, startup:startups!inner(is_demo)")
        .eq("status", "closed")
        .eq("startup.is_demo", false),
    ]);

    const totalRaised = (deals.data ?? []).reduce(
      (sum: number, d: { amount?: number }) => sum + (d.amount ?? 0),
      0
    );

    return {
      startupCount:     startups.count  ?? 0,
      investorCount:    investors.count ?? 0,
      totalRaised,
      dealsClosedCount: deals.data?.length ?? 0,
    };
  } catch {
    return FLOOR;
  }
}
