import { getFounderPlan, getInvestorPlan } from "@/lib/plans";

// ── Access context ────────────────────────────────────────────────────────────

export interface AccessContext {
  userId:       string | null;
  role:         "startup" | "investor" | "admin" | null;
  tier:         string | null;
  isLaunchMode: boolean;
}

// ── Investor gates ────────────────────────────────────────────────────────────

export function canViewFinancials(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getInvestorPlan(ctx.tier);
  return plan.features.viewFinancials;
}

export function canSendMessages(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getInvestorPlan(ctx.tier);
  return plan.features.sendMessages;
}

export function canAiDueDiligence(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getInvestorPlan(ctx.tier);
  return plan.features.aiDueDiligence;
}

export function canExportData(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getInvestorPlan(ctx.tier);
  return plan.features.exportData;
}

export function canUseSavedSearches(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getInvestorPlan(ctx.tier);
  return plan.features.savedSearches;
}

export function canUseAdvancedFilters(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getInvestorPlan(ctx.tier);
  return plan.features.advancedFilters;
}

// Returns the monthly message thread limit, or null for unlimited.
export function getMessageLimit(ctx: AccessContext): number | null {
  if (ctx.isLaunchMode) return null;
  const plan = getInvestorPlan(ctx.tier);
  return plan.features.messageLimit;
}

// ── Founder gates ─────────────────────────────────────────────────────────────

export function canFounderBeListed(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getFounderPlan(ctx.tier);
  return plan.features.listed;
}

export function canFounderViewAnalytics(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getFounderPlan(ctx.tier);
  return plan.features.analytics;
}

export function canFounderAiPitchFeedback(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getFounderPlan(ctx.tier);
  return plan.features.aiPitchFeedback;
}

export function canFounderFeaturedBadge(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getFounderPlan(ctx.tier);
  return plan.features.featuredBadge;
}

export function canFounderDemoVideo(ctx: AccessContext): boolean {
  if (ctx.isLaunchMode) return true;
  const plan = getFounderPlan(ctx.tier);
  return plan.features.demoVideo;
}

export function getFounderDocumentsLimit(ctx: AccessContext): number {
  if (ctx.isLaunchMode) return 10;
  const plan = getFounderPlan(ctx.tier);
  return plan.features.documentsLimit;
}

// ── Convenience: build context from profile row ───────────────────────────────

export function buildAccessContext(
  profile: { id: string; role: string; subscription_tier: string | null } | null,
  isLaunchMode: boolean,
): AccessContext {
  if (!profile) {
    return { userId: null, role: null, tier: null, isLaunchMode };
  }
  return {
    userId:       profile.id,
    role:         profile.role as AccessContext["role"],
    tier:         profile.subscription_tier,
    isLaunchMode,
  };
}
