import { computePlatformData } from "@/lib/platform-data";

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

/**
 * The homepage's headline numbers, read from the SAME aggregate the Data
 * Centre renders (lib/platform-data). Two public surfaces quoting different
 * counts for one platform make at least one of them a lie, so the homepage
 * must not keep aggregate queries of its own beside /data's.
 *
 * The shared aggregate includes sample listings, and /data footnotes that.
 * The planned demo purge removes those rows at the source, at which point
 * both surfaces drop to the real numbers together with no change here.
 *
 * The optional client param is accepted for existing call sites but unused:
 * the aggregate builds its own admin client so both surfaces read through
 * one code path.
 */
export async function getPlatformStats(_supabase?: unknown): Promise<PlatformStats> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!supabaseUrl || supabaseUrl.includes("placeholder")) return FLOOR;

  const data = await computePlatformData();
  if (!data) return FLOOR;

  return {
    startupCount:     data.startupCount,
    investorCount:    data.investorCount,
    totalRaised:      data.totalRaised,
    dealsClosedCount: data.dealsCount,
  };
}
