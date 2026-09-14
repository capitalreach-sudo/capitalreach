import { roundCloseState } from "@/lib/round-close";
import { sameCountry } from "@/lib/countries";

/**
 * One matcher for saved searches. Previously the browse page filtered on ~14
 * fields while the alert cron re-implemented six of them, so alerts fired on
 * listings the saved search itself would have excluded (and ignored raising/
 * runway/growth/closing-soon/business-model/demo criteria entirely). Both
 * surfaces now call this, so "the search matched" means the same thing in
 * the browser and in the notification.
 */
export interface SavedSearchFilters {
  query?: string;
  industries?: string[];
  stages?: string[];
  /** Legacy single-select (pre multi-select geography). Saved searches
   *  written before that change still carry this; matched below alongside
   *  `countries` so an old saved search keeps firing exactly as it did. */
  country?: string;
  /** Current multi-select geography, mirroring the investor directory's
   *  `geographies` filter. A listing matches if its country is any one of
   *  these. */
  countries?: string[];
  mrrMin?: number;
  aiScoreMin?: number;
  raisingMin?: number;
  runwayMin?: number;
  growthMin?: number;
  closingSoon?: boolean;
  businessModel?: string;
  hasDemo?: boolean;
  newOnly?: boolean; // browse-only (relative to viewing time); ignored for alerts
}

export interface MatchableStartup {
  name: string;
  tagline?: string | null;
  industry: string;
  stage: string;
  country?: string | null;
  mrr?: number | null;
  vaultrise_score?: number | null;
  funding_target?: number | null;
  runway_months?: number | null;
  growth_rate?: number | null;
  round_close_date?: string | null;
  business_model?: string | null;
  demo_video_url?: string | null;
}

export function matchesSavedSearch(f: SavedSearchFilters, s: MatchableStartup): boolean {
  const q = (f.query ?? "").trim().toLowerCase();
  // Industry joins the text clause so the browser filter agrees with the
  // server search (browse-data matches industry.ilike): typing "fintech"
  // used to show "No listings match" over seven live FinTech rounds.
  if (q && !s.name.toLowerCase().includes(q) && !(s.tagline ?? "").toLowerCase().includes(q)
        && !(s.industry ?? "").toLowerCase().includes(q)) return false;
  if (f.industries?.length && !f.industries.includes(s.industry)) return false;
  if (f.stages?.length && !f.stages.includes(s.stage)) return false;
  // countries (current, multi-select) takes over from country (legacy,
  // single) when a saved search carries both -- countries is what the UI
  // writes going forward, so it wins if present.
  const countryList = f.countries?.length ? f.countries : (f.country ? [f.country] : []);
  if (countryList.length && !countryList.some((c) => sameCountry(c, s.country ?? null))) return false;
  if ((f.mrrMin ?? 0) > 0 && (s.mrr ?? 0) < (f.mrrMin as number)) return false;
  if ((f.aiScoreMin ?? 0) > 0 && (s.vaultrise_score ?? 0) < (f.aiScoreMin as number)) return false;
  if ((f.raisingMin ?? 0) > 0 && (s.funding_target ?? 0) < (f.raisingMin as number)) return false;
  if ((f.runwayMin ?? 0) > 0 && (s.runway_months ?? 0) < (f.runwayMin as number)) return false;
  if ((f.growthMin ?? 0) > 0 && (s.growth_rate ?? 0) < (f.growthMin as number)) return false;
  if (f.closingSoon && roundCloseState(s.round_close_date) === null) return false;
  if (f.businessModel && s.business_model !== f.businessModel) return false;
  if (f.hasDemo && !s.demo_video_url) return false;
  return true;
}
