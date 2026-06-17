// Single source of truth for plan definitions, feature flags, and tier helpers.

// ── Founder plans ─────────────────────────────────────────────────────────────

export interface FounderFeatures {
  listed:             boolean;
  analytics:          boolean;
  aiPitchFeedback:    boolean;
  documentsLimit:     number;   // max documents (0 = none)
  featuredBadge:      boolean;
  demoVideo:          boolean;
  priorityReview:     boolean;
  customSlug:         boolean;
}

export interface FounderPlan {
  id:       FounderPlanId;
  name:     string;
  price:    number;
  interval: "month" | null;
  envKey:   string | null;
  features: FounderFeatures;
  highlight?: string;
}

export type FounderPlanId = "free" | "starter" | "growth";

export const FOUNDER_PLANS: Record<FounderPlanId, FounderPlan> = {
  free: {
    id:       "free",
    name:     "Free",
    price:    0,
    interval: null,
    envKey:   null,
    features: {
      listed:          false,
      analytics:       false,
      aiPitchFeedback: false,
      documentsLimit:  0,
      featuredBadge:   false,
      demoVideo:       false,
      priorityReview:  false,
      customSlug:      false,
    },
  },
  starter: {
    id:       "starter",
    name:     "Starter",
    price:    29,
    interval: "month",
    envKey:   "STRIPE_PRICE_FOUNDER_STARTER_MONTHLY",
    highlight: "Most popular",
    features: {
      listed:          true,
      analytics:       true,
      aiPitchFeedback: true,
      documentsLimit:  3,
      featuredBadge:   false,
      demoVideo:       false,
      priorityReview:  false,
      customSlug:      true,
    },
  },
  growth: {
    id:       "growth",
    name:     "Growth",
    price:    79,
    interval: "month",
    envKey:   "STRIPE_PRICE_FOUNDER_GROWTH_MONTHLY",
    features: {
      listed:          true,
      analytics:       true,
      aiPitchFeedback: true,
      documentsLimit:  10,
      featuredBadge:   true,
      demoVideo:       true,
      priorityReview:  true,
      customSlug:      true,
    },
  },
};

export const FOUNDER_PLANS_LIST: FounderPlan[] = [
  FOUNDER_PLANS.free,
  FOUNDER_PLANS.starter,
  FOUNDER_PLANS.growth,
];

// ── Investor plans ────────────────────────────────────────────────────────────

export interface InvestorFeatures {
  browseStartups:      boolean;
  viewFinancials:      boolean;
  sendMessages:        boolean;
  messageLimit:        number | null;  // null = unlimited
  aiDueDiligence:      boolean;
  exportData:          boolean;
  savedSearches:       boolean;
  advancedFilters:     boolean;
  institutionSupport:  boolean;
}

export interface InvestorPlan {
  id:       InvestorPlanId;
  name:     string;
  price:    number;
  interval: "month" | null;
  envKey:   string | null;
  features: InvestorFeatures;
  highlight?: string;
}

export type InvestorPlanId = "free" | "angel" | "pro" | "institution";

export const INVESTOR_PLANS: Record<InvestorPlanId, InvestorPlan> = {
  free: {
    id:       "free",
    name:     "Explorer",
    price:    0,
    interval: null,
    envKey:   null,
    features: {
      browseStartups:     true,
      viewFinancials:     false,
      sendMessages:       false,
      messageLimit:       0,
      aiDueDiligence:     false,
      exportData:         false,
      savedSearches:      false,
      advancedFilters:    false,
      institutionSupport: false,
    },
  },
  angel: {
    id:       "angel",
    name:     "Angel",
    price:    99,
    interval: "month",
    envKey:   "STRIPE_PRICE_INVESTOR_ANGEL_MONTHLY",
    highlight: "Most popular",
    features: {
      browseStartups:     true,
      viewFinancials:     true,
      sendMessages:       true,
      messageLimit:       10,
      aiDueDiligence:     false,
      exportData:         false,
      savedSearches:      true,
      advancedFilters:    true,
      institutionSupport: false,
    },
  },
  pro: {
    id:       "pro",
    name:     "Pro Investor",
    price:    249,
    interval: "month",
    envKey:   "STRIPE_PRICE_INVESTOR_PRO_MONTHLY",
    features: {
      browseStartups:     true,
      viewFinancials:     true,
      sendMessages:       true,
      messageLimit:       null,
      aiDueDiligence:     true,
      exportData:         true,
      savedSearches:      true,
      advancedFilters:    true,
      institutionSupport: false,
    },
  },
  institution: {
    id:       "institution",
    name:     "Institution",
    price:    0,
    interval: null,
    envKey:   null,
    features: {
      browseStartups:     true,
      viewFinancials:     true,
      sendMessages:       true,
      messageLimit:       null,
      aiDueDiligence:     true,
      exportData:         true,
      savedSearches:      true,
      advancedFilters:    true,
      institutionSupport: true,
    },
  },
};

export const INVESTOR_PLANS_LIST: InvestorPlan[] = [
  INVESTOR_PLANS.free,
  INVESTOR_PLANS.angel,
  INVESTOR_PLANS.pro,
  INVESTOR_PLANS.institution,
];

// ── DB tier → plan ID normalisation ──────────────────────────────────────────
// The DB may contain legacy values; normalise them to canonical plan IDs.

function normaliseFounderTier(dbTier: string | null | undefined): FounderPlanId {
  switch (dbTier) {
    case "growth":  return "growth";
    case "starter":
    case "listed":
    case "pro":
    case "premium": return "starter";
    default:        return "free";
  }
}

function normaliseInvestorTier(dbTier: string | null | undefined): InvestorPlanId {
  switch (dbTier) {
    case "institution":
    case "institutional": return "institution";
    case "pro":
    case "pro_investor":  return "pro";
    case "angel":         return "angel";
    default:              return "free";
  }
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getFounderPlan(dbTier: string | null | undefined): FounderPlan {
  return FOUNDER_PLANS[normaliseFounderTier(dbTier)];
}

export function getInvestorPlan(dbTier: string | null | undefined): InvestorPlan {
  return INVESTOR_PLANS[normaliseInvestorTier(dbTier)];
}

// ── Feature gate helpers ──────────────────────────────────────────────────────

export type FounderAction =
  | "listed"
  | "analytics"
  | "aiPitchFeedback"
  | "featuredBadge"
  | "demoVideo"
  | "priorityReview"
  | "customSlug";

export type InvestorAction =
  | "viewFinancials"
  | "sendMessages"
  | "aiDueDiligence"
  | "exportData"
  | "savedSearches"
  | "advancedFilters";

export function canFounderDoAction(
  dbTier: string | null | undefined,
  action: FounderAction,
  isLaunchMode = false,
): boolean {
  if (isLaunchMode) return true;
  const plan = getFounderPlan(dbTier);
  return !!plan.features[action as keyof FounderFeatures];
}

export function canInvestorDoAction(
  dbTier: string | null | undefined,
  action: InvestorAction,
  isLaunchMode = false,
): boolean {
  if (isLaunchMode) return true;
  const plan = getInvestorPlan(dbTier);
  return !!plan.features[action as keyof InvestorFeatures];
}

// ── Stripe price env var resolution ──────────────────────────────────────────

export function getStripePriceId(envKey: string | null): string | null {
  if (!envKey) return null;
  return process.env[envKey] ?? null;
}
