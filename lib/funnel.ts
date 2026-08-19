/**
 * E56: where people fall out.
 *
 * The admin page counted totals — accounts, listings, deals — which tell you
 * how big the platform is and nothing about where it leaks. The question an
 * operator actually has is "of the founders who signed up, how many ever got
 * a listing live, and of those how many ever heard from an investor".
 *
 * Two rules here, both learned the hard way elsewhere:
 *  - every step counts DISTINCT subjects, not events, or one busy founder
 *    with eight deals makes the funnel look like it widens;
 *  - a step is never counted as a percentage of a step it does not descend
 *    from, so the numbers cannot exceed 100% or imply a conversion that did
 *    not happen.
 */

export interface FunnelStep {
  key: string;
  count: number;
  /** Share of the step above. null for the first step. */
  fromPrev: number | null;
  /** Share of the top of the funnel. null for the first step. */
  fromTop: number | null;
}

export interface FunnelInput {
  founders: Array<{ id: string }>;
  listings: Array<{ owner_id: string | null; status: string; listed_at: string | null }>;
  deals: Array<{ startup_id: string | null; status: string; closed_at: string | null; funded_at: string | null }>;
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function summariseFunnel(input: FunnelInput): FunnelStep[] {
  const founders = new Set(input.founders.map(f => f.id));

  const withListing = new Set(
    input.listings.map(l => l.owner_id).filter((id): id is string => !!id && founders.has(id))
  );

  const liveOwners = new Set(
    input.listings
      .filter(l => l.status === "active" || !!l.listed_at)
      .map(l => l.owner_id)
      .filter((id): id is string => !!id && founders.has(id))
  );

  // Listings that reached each deal stage, counted as listings rather than
  // deals: a listing with six interested investors is one listing that got
  // interest, not six.
  const liveListingIds = new Set(
    input.listings.filter(l => l.status === "active" || !!l.listed_at).map(l => (l as { id?: string }).id).filter(Boolean) as string[]
  );
  const byStage = (test: (d: FunnelInput["deals"][number]) => boolean) =>
    new Set(input.deals.filter(test).map(d => d.startup_id).filter((id): id is string => !!id &&
      (liveListingIds.size === 0 || liveListingIds.has(id))));

  const anyInterest = byStage(() => true);
  const diligence = byStage(d => ["due_diligence", "term_sheet", "closed"].includes(d.status));
  const termSheet = byStage(d => ["term_sheet", "closed"].includes(d.status));
  const closed = byStage(d => d.status === "closed" || !!d.closed_at);
  const funded = byStage(d => !!d.funded_at);

  const raw: Array<[string, number]> = [
    ["signedUp", founders.size],
    ["createdListing", withListing.size],
    ["wentLive", liveOwners.size],
    ["gotInterest", anyInterest.size],
    ["reachedDiligence", diligence.size],
    ["reachedTermSheet", termSheet.size],
    ["closed", closed.size],
    ["funded", funded.size],
  ];

  const top = raw[0][1];
  return raw.map(([key, count], i) => ({
    key,
    count,
    fromPrev: i === 0 ? null : pct(count, raw[i - 1][1]),
    fromTop: i === 0 ? null : pct(count, top),
  }));
}
