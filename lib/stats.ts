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

    const [startups, investors, deals] = await Promise.all([
      db
        .from("startups")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      db
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "investor"),
      db
        .from("deals")
        .select("amount")
        .eq("status", "closed"),
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
