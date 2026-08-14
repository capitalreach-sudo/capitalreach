import { getFounderPlan, getInvestorPlan } from "@/lib/plans";
import type { FounderPlanId, InvestorPlanId } from "@/lib/plans";

// Single source of truth for feature access.
//
// Two layers, deliberately:
//   • founderCan() / investorCan()  — full capability objects, including the
//     numeric limits (documents, listings, messages, watchlist) that the old
//     boolean-only gates had no way to express.
//   • canX(ctx)                     — the original narrow helpers, kept because
//     four call sites use them. They now delegate to the objects above so there
//     is exactly one place where a tier decision is actually made.
//
// Suspension short-circuits everything: a suspended account can read what it
// already had access to, but can perform no gated action at all.

// ── Access context ────────────────────────────────────────────────────────────

export interface AccessContext {
  userId:       string | null;
  role:         "startup" | "investor" | "admin" | null;
  tier:         string | null;
  isLaunchMode: boolean;
  suspended:    boolean;
}

// ── Effective tier ────────────────────────────────────────────────────────────
// Launch mode grants the top tier to everyone. Suspension overrides it.

function founderTier(ctx: AccessContext): FounderPlanId | "suspended" {
  if (ctx.suspended) return "suspended";
  // Admins hold the top tier on every surface. Suspension still wins above:
  // a suspended admin is a deliberately locked account, and the lock should
  // hold for them too.
  if (ctx.role === "admin") return "growth";
  if (ctx.isLaunchMode) return "growth";
  return getFounderPlan(ctx.tier).id;
}

function investorTier(ctx: AccessContext): InvestorPlanId | "suspended" {
  if (ctx.suspended) return "suspended";
  if (ctx.role === "admin") return "pro";
  if (ctx.isLaunchMode) return "pro";
  return getInvestorPlan(ctx.tier).id;
}

// ── Founder capabilities ──────────────────────────────────────────────────────

export interface FounderCapabilities {
  listStartup:         boolean;
  listingLimit:        number;
  docLimit:            number;
  useNDA:              boolean;
  seeInvestorIdentity: boolean;
  messageLimit:        number;   // Infinity = unlimited
  aiPitchScore:        boolean;
  aiWrittenFeedback:   boolean;
  demoVideo:           boolean;
  priorityReview:      boolean;
  analyticsLevel:      "none" | "basic" | "full";
}

const FOUNDER_SUSPENDED: FounderCapabilities = {
  listStartup: false, listingLimit: 0, docLimit: 0, useNDA: false,
  seeInvestorIdentity: false, messageLimit: 0, aiPitchScore: false,
  aiWrittenFeedback: false, demoVideo: false,
  priorityReview: false, analyticsLevel: "none",
};

export function founderCan(ctx: AccessContext): FounderCapabilities {
  const tier = founderTier(ctx);
  if (tier === "suspended") return FOUNDER_SUSPENDED;

  const paid = tier === "starter" || tier === "growth";
  const plan = getFounderPlan(tier);

  return {
    listStartup:         true,
    listingLimit:        tier === "growth" ? Infinity : 1,
    // documentsLimit lives on the plan itself — don't duplicate the numbers.
    docLimit:            tier === "growth" ? Infinity : plan.features.documentsLimit,
    useNDA:              paid,
    seeInvestorIdentity: paid,
    messageLimit:        tier === "growth" ? Infinity : tier === "starter" ? 50 : 5,
    aiPitchScore:        plan.features.aiPitchFeedback,
    aiWrittenFeedback:   tier === "growth",
    demoVideo:           plan.features.demoVideo,
    priorityReview:      plan.features.priorityReview,
    analyticsLevel:      !plan.features.analytics ? "basic" : "full",
  };
}

// ── Investor capabilities ─────────────────────────────────────────────────────

export interface InvestorCapabilities {
  browse:          boolean;
  viewFinancials:  boolean;
  viewDocuments:   boolean;
  viewTeam:        boolean;
  ndaRequest:      boolean;
  message:         boolean;
  messageLimit:    number;   // Infinity = unlimited
  watchlistLimit:  number;
  aiScore:         boolean;
  aiDiligence:     "no" | "paid" | "included";
  aiMatching:      boolean;
  dataExport:      boolean;
  savedSearches:   boolean;
  advancedFilters: boolean;
}

const INVESTOR_SUSPENDED: InvestorCapabilities = {
  browse: false, viewFinancials: false, viewDocuments: false, viewTeam: false,
  ndaRequest: false, message: false, messageLimit: 0, watchlistLimit: 0,
  aiScore: false, aiDiligence: "no", aiMatching: false, dataExport: false,
  savedSearches: false, advancedFilters: false,
};

export function investorCan(ctx: AccessContext): InvestorCapabilities {
  const tier = investorTier(ctx);
  if (tier === "suspended") return INVESTOR_SUSPENDED;

  const plan = getInvestorPlan(tier);
  const f = plan.features;
  const paid = tier === "angel" || tier === "pro" || tier === "institution";

  return {
    browse:          f.browseStartups,
    viewFinancials:  f.viewFinancials,
    // Documents and team sit behind the same paywall as financials.
    viewDocuments:   f.viewFinancials,
    viewTeam:        f.viewFinancials,
    ndaRequest:      paid,
    message:         f.sendMessages,
    messageLimit:    f.messageLimit === null ? Infinity : f.messageLimit,
    watchlistLimit:  tier === "free" ? 5 : Infinity,
    aiScore:         paid,
    // Pro/Institution include AI diligence; Angel may buy it per-report.
    aiDiligence:     f.aiDueDiligence ? "included" : tier === "angel" ? "paid" : "no",
    aiMatching:      paid,
    dataExport:      f.exportData,
    savedSearches:   f.savedSearches,
    advancedFilters: f.advancedFilters,
  };
}

// ── Investor gates (existing API — delegates to investorCan) ──────────────────

export function canViewFinancials(ctx: AccessContext): boolean {
  return investorCan(ctx).viewFinancials;
}

export function canSendMessages(ctx: AccessContext): boolean {
  return investorCan(ctx).message;
}

export function canAiDueDiligence(ctx: AccessContext): boolean {
  return investorCan(ctx).aiDiligence === "included";
}

export function canExportData(ctx: AccessContext): boolean {
  return investorCan(ctx).dataExport;
}

export function canUseSavedSearches(ctx: AccessContext): boolean {
  return investorCan(ctx).savedSearches;
}

export function canUseAdvancedFilters(ctx: AccessContext): boolean {
  return investorCan(ctx).advancedFilters;
}

// Returns the monthly message thread limit, or null for unlimited.
export function getMessageLimit(ctx: AccessContext): number | null {
  const limit = investorCan(ctx).messageLimit;
  return limit === Infinity ? null : limit;
}

// ── Founder gates (existing API — delegates to founderCan) ───────────────────

export function canFounderBeListed(ctx: AccessContext): boolean {
  return founderCan(ctx).listStartup && founderTier(ctx) !== "free";
}

export function canFounderViewAnalytics(ctx: AccessContext): boolean {
  return founderCan(ctx).analyticsLevel === "full";
}

export function canFounderAiPitchFeedback(ctx: AccessContext): boolean {
  return founderCan(ctx).aiPitchScore;
}


export function canFounderDemoVideo(ctx: AccessContext): boolean {
  return founderCan(ctx).demoVideo;
}

export function getFounderDocumentsLimit(ctx: AccessContext): number {
  return founderCan(ctx).docLimit;
}

// ── Convenience: build context from a profile row ────────────────────────────

export function buildAccessContext(
  profile: {
    id: string;
    role: string;
    subscription_tier: string | null;
    suspended?: boolean | null;
    account_status?: string | null;
  } | null,
  isLaunchMode: boolean,
): AccessContext {
  if (!profile) {
    return { userId: null, role: null, tier: null, isLaunchMode, suspended: false };
  }
  return {
    userId:       profile.id,
    role:         profile.role as AccessContext["role"],
    tier:         profile.subscription_tier,
    isLaunchMode,
    suspended:    !!profile.suspended
                    || profile.account_status === "suspended"
                    || profile.account_status === "banned",
  };
}

// ── Convenience: fetch context straight from Supabase ────────────────────────

export async function getUserContext(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  isLaunchMode: boolean,
): Promise<AccessContext> {
  const { data } = await supabase
    .from("profiles")
    .select("id, role, subscription_tier, suspended, account_status")
    .eq("id", userId)
    .maybeSingle();

  return buildAccessContext(data, isLaunchMode);
}

// ── Suspension ────────────────────────────────────────────────────────────────

export function isSuspended(ctx: AccessContext): boolean {
  return ctx.suspended;
}
