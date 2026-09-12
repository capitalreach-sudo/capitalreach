import { createAdminClient } from "@/lib/supabase-server";
import { isValidFundingTarget, sumFundingTargets } from "@/lib/validators";
import { STAGE_LABELS } from "@/lib/utils";

/**
 * The anonymous sector teaser: what a signed-out visitor (and a crawler) may
 * be told about one sector's market without naming anybody in it.
 *
 * THE LINE THAT MAY NOT BE CROSSED: nothing that identifies a company reaches
 * the anonymous response. No name, no slug, no logo_url, no website, no
 * founder -- and no id either, because a stable identifier is a join key even
 * when it is opaque. What survives is what founders wrote knowing it is
 * public-facing (tagline, stage, city, country, raise) plus aggregates, which
 * say something about the sector and nothing about any one company. The
 * SELECT below is the enforcement: fields that are never queried cannot leak
 * through a serialised page payload.
 */

export type SectorTeaserEntry = {
  tagline: string;
  stage: string;
  city: string | null;
  country: string | null;
  funding_target: number;
};

export type SectorTeaser = {
  /** True count of active, unpaused rounds in the sector. */
  activeCount: number;
  /** Sum of plausible funding targets (bad rows excluded, lib/validators). */
  totalRaise: number;
  /** Median plausible funding target; null when no row carries one. */
  medianRaise: number | null;
  /** Stage distribution in canonical stage order, zero-count stages omitted. */
  stages: Array<{ stage: string; count: number }>;
  /** Up to six newest rounds, identity-masked. */
  entries: SectorTeaserEntry[];
};

const ENTRY_LIMIT = 6;
/** Aggregation window; no sector is anywhere near it today. */
const ROW_LIMIT = 500;

/**
 * Service-role read (createAdminClient), which is already pinned to
 * `cache: "no-store"` -- the figures on the page are as fresh as the request,
 * never a cached copy of an earlier market. Deliberately NOT wrapped in
 * unstable_cache for the same reason.
 *
 * Demo listings are excluded: the teaser presents its figures as the real
 * market to visitors who cannot see the DemoBadge a member's card would
 * carry, the same call /api/pulse makes for its public events.
 *
 * Throws on a failed read. The page renders factual claims about the sector
 * ("12 active rounds"), and a failed read must not become "0 active rounds".
 */
export async function loadSectorTeaser(industry: string): Promise<SectorTeaser> {
  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("startups")
    .select("tagline, stage, city, country, funding_target", { count: "exact" })
    .eq("status", "active")
    // B16: a founder-paused round is off the market until they resume it.
    .neq("round_state", "paused")
    .eq("industry", industry)
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);
  if (error) throw new Error(`sector teaser ${industry}: ${error.message}`);

  const rows = data ?? [];

  // Aggregates judge only plausible figures, through the same bounds every
  // other surface applies (lib/validators) -- one 10^17 test row must not
  // become the sector's headline number.
  const targets = rows
    .map((r) => r.funding_target)
    .filter(isValidFundingTarget)
    .sort((a, b) => a - b);
  const mid = targets.length >> 1;
  const medianRaise =
    targets.length === 0
      ? null
      : targets.length % 2
        ? targets[mid]
        : (targets[mid - 1] + targets[mid]) / 2;

  const byStage = new Map<string, number>();
  for (const r of rows) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + 1);
  // Canonical stage order first (the order a round progresses), then anything
  // the label map does not know, so an unexpected value is shown rather than
  // silently dropped from a distribution that claims to sum to the count.
  const canonical = Object.keys(STAGE_LABELS);
  // Array.from, not spread: the tsconfig target predates MapIterator spread.
  const stages = Array.from(byStage, ([stage, cnt]) => ({ stage, count: cnt }))
    .sort((a, b) => {
      const ia = canonical.indexOf(a.stage);
      const ib = canonical.indexOf(b.stage);
      return (ia === -1 ? canonical.length : ia) - (ib === -1 ? canonical.length : ib);
    });

  return {
    activeCount: count ?? rows.length,
    totalRaise: sumFundingTargets(rows.map((r) => r.funding_target)),
    medianRaise,
    stages,
    // Rebuilt field by field rather than spread: the masked shape is a
    // guarantee, not whatever the query happened to return.
    entries: rows.slice(0, ENTRY_LIMIT).map((r) => ({
      tagline: r.tagline,
      stage: r.stage,
      city: r.city,
      country: r.country,
      funding_target: r.funding_target,
    })),
  };
}
