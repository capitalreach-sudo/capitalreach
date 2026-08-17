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
  country?: string;
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
  if (q && !s.name.toLowerCase().includes(q) && !(s.tagline ?? "").toLowerCase().includes(q)) return false;
  if (f.industries?.length && !f.industries.includes(s.industry)) return false;
  if (f.stages?.length && !f.stages.includes(s.stage)) return false;
  if (f.country && !sameCountry(f.country, s.country ?? null)) return false;
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
