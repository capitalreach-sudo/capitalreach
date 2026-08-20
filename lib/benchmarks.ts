/**
 * F10: where a founder stands against the platform's other rounds.
 *
 * A founder sees their own MRR every day and has no idea whether it is good.
 * The platform knows — every listing at the same stage discloses the same
 * numbers — and until now that comparison existed nowhere.
 *
 * Percentiles, not rankings. "You are #4 of 23" invites reverse-engineering
 * who #3 is; "p68" says where you stand without pointing at anyone. Each
 * metric is ranked only among peers who DISCLOSED it — a pre-revenue company
 * that left MRR blank is not a zero to beat, it is absent from that metric's
 * comparison entirely.
 */

export interface PeerMetrics {
  mrr: number | null;
  growth_rate: number | null;
  runway_months: number | null;
  vaultrise_score: number | null;
}

export interface BenchmarkEntry {
  key: keyof PeerMetrics;
  /** 0–100: the share of disclosing peers strictly below you. */
  percentile: number;
  /** How many peers disclosed this metric (you excluded). */
  peers: number;
}

export interface BenchmarkResult {
  entries: BenchmarkEntry[];
  cohortSize: number;
}

/** Fewer than this and a percentile is noise dressed as insight. */
export const MIN_PEERS = 5;

const METRIC_KEYS: Array<keyof PeerMetrics> = ["mrr", "growth_rate", "runway_months", "vaultrise_score"];

/**
 * Percentile of `value` within `peers`: the share strictly below, so the
 * bottom of a cohort reads p0 and beating everyone reads p100. Ties sit at
 * the bottom of their tie group rather than being flattered — three companies
 * on identical MRR are all "below or equal", not all "above average".
 */
export function percentileAmong(value: number, peers: number[]): number {
  if (peers.length === 0) return 0;
  const below = peers.filter(p => p < value).length;
  return Math.round((below / peers.length) * 100);
}

export function computeBenchmarks(own: PeerMetrics, cohort: PeerMetrics[]): BenchmarkResult {
  const entries: BenchmarkEntry[] = [];

  for (const key of METRIC_KEYS) {
    const mine = own[key];
    if (mine == null || !Number.isFinite(Number(mine))) continue;

    const disclosed = cohort
      .map(p => p[key])
      .filter((v): v is number => v != null && Number.isFinite(Number(v)))
      .map(Number);

    if (disclosed.length < MIN_PEERS) continue;
    entries.push({ key, percentile: percentileAmong(Number(mine), disclosed), peers: disclosed.length });
  }

  return { entries, cohortSize: cohort.length };
}
