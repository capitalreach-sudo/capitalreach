// Single source of truth for plan definitions, feature flags, and tier helpers.

// ── Founder plans ─────────────────────────────────────────────────────────────

export interface FounderFeatures {
  listed:             boolean;
  analytics:          boolean;
  aiPitchFeedback:    boolean;
  documentsLimit:     number;   // max documents (0 = none)
  demoVideo:          boolean;
  priorityReview:     boolean;
  customSlug:         boolean;
  // Added when the tiers were made genuinely different. Every one of these is
  // a feature the platform already has and was giving away identically to all
  // three tiers, which is why the plans read as the same product at three
  // prices. Each is enforced in the route that owns it — a pricing table that
  // claims a gate nobody enforces is just a lie with a checkmark next to it.
  teamSeats:          number;   // people who can work the pipeline with you
  investorUpdates:    boolean;  // periodic update posts to your investors
  dataRoom:           boolean;  // request/track documents with an investor
  externalContacts:   boolean;  // track off-platform investors in your pipeline
  exportData:         boolean;  // CSV of your own pipeline
}

export interface FounderPlan {
  id:       FounderPlanId;
  name:     string;
  price:    number;
  /** Total charged for twelve months up front. null when there is nothing to buy. */
  annualPrice: number | null;
  interval: "month" | null;
  envKey:   string | null;
  envKeyAnnual: string | null;
  features: FounderFeatures;
  highlight?: string;
}

export type FounderPlanId = "free" | "starter" | "growth";

export const FOUNDER_PLANS: Record<FounderPlanId, FounderPlan> = {
  free: {
    id:       "free",
    name:     "Free",
    price:    0,
    annualPrice: null,
    interval: null,
    envKey:   null,
    envKeyAnnual: null,
    features: {
      listed:          false,
      analytics:       false,
      aiPitchFeedback: false,
      documentsLimit:  0,
      demoVideo:       false,
      priorityReview:  false,
      customSlug:      false,
      teamSeats:       1,
      investorUpdates: false,
      dataRoom:        false,
      externalContacts: false,
      exportData:      false,
    },
  },
  starter: {
    id:       "starter",
    name:     "Starter",
    price:    29,
    annualPrice: 259,
    interval: "month",
    envKey:   "STRIPE_PRICE_FOUNDER_STARTER_MONTHLY",
    envKeyAnnual: "STRIPE_PRICE_FOUNDER_STARTER_ANNUAL",
    highlight: "Most popular",
    features: {
      listed:          true,
      analytics:       true,
      aiPitchFeedback: true,
      documentsLimit:  3,
      demoVideo:       false,
      priorityReview:  false,
      customSlug:      true,
      teamSeats:       3,
      investorUpdates: true,
      dataRoom:        false,
      externalContacts: true,
      exportData:      true,
    },
  },
  growth: {
    id:       "growth",
    name:     "Growth",
    price:    79,
    annualPrice: 699,
    interval: "month",
    envKey:   "STRIPE_PRICE_FOUNDER_GROWTH_MONTHLY",
    envKeyAnnual: "STRIPE_PRICE_FOUNDER_GROWTH_ANNUAL",
    features: {
      listed:          true,
      analytics:       true,
      aiPitchFeedback: true,
      documentsLimit:  10,
      demoVideo:       true,
      priorityReview:  true,
      customSlug:      true,
      teamSeats:       10,
      investorUpdates: true,
      dataRoom:        true,
      externalContacts: true,
      exportData:      true,
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
  // See the note on FounderFeatures. Same reasoning, same enforcement rule.
  scorecards:          boolean;  // score a company against your own criteria
  checklistTemplates:  boolean;  // reusable diligence checklists
  portfolio:           boolean;  // ownership and valuation across closed deals
  allocationTracking:  boolean;  // deploy-against-target for the period
  coInvestorVisibility: boolean; // see who else is in, and be seen
}

export interface InvestorPlan {
  id:       InvestorPlanId;
  name:     string;
  price:    number;
  annualPrice: number | null;
  interval: "month" | null;
  envKey:   string | null;
  envKeyAnnual: string | null;
  features: InvestorFeatures;
  highlight?: string;
}

export type InvestorPlanId = "free" | "angel" | "pro" | "institution";

export const INVESTOR_PLANS: Record<InvestorPlanId, InvestorPlan> = {
  free: {
    id:       "free",
    name:     "Explorer",
    price:    0,
    annualPrice: null,
    interval: null,
    envKey:   null,
    envKeyAnnual: null,
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
      scorecards:         false,
      checklistTemplates: false,
      portfolio:          false,
      allocationTracking: false,
      coInvestorVisibility: false,
    },
  },
  angel: {
    id:       "angel",
    name:     "Angel",
    price:    99,
    annualPrice: 879,
    interval: "month",
    envKey:   "STRIPE_PRICE_INVESTOR_ANGEL_MONTHLY",
    envKeyAnnual: "STRIPE_PRICE_INVESTOR_ANGEL_ANNUAL",
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
      scorecards:         true,
      checklistTemplates: false,
      portfolio:          true,
      allocationTracking: false,
      coInvestorVisibility: false,
    },
  },
  pro: {
    id:       "pro",
    name:     "Pro Investor",
    price:    249,
    annualPrice: 2190,
    interval: "month",
    envKey:   "STRIPE_PRICE_INVESTOR_PRO_MONTHLY",
    envKeyAnnual: "STRIPE_PRICE_INVESTOR_PRO_ANNUAL",
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
      scorecards:         true,
      checklistTemplates: true,
      portfolio:          true,
      allocationTracking: true,
      coInvestorVisibility: true,
    },
  },
  institution: {
    id:       "institution",
    name:     "Institution",
    price:    0,
    annualPrice: null,
    interval: null,
    envKey:   null,
    envKeyAnnual: null,
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
      scorecards:         true,
      checklistTemplates: true,
      portfolio:          true,
      allocationTracking: true,
      coInvestorVisibility: true,
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



// ── Stripe price env var resolution ──────────────────────────────────────────

// ── Annual billing ───────────────────────────────────────────────────────────

/**
 * Paying for a year up front costs about a quarter less than paying monthly.
 *
 * The pricing page has had a monthly/annual toggle for a while that computed
 * "ten months for twelve" in the component and then handed the CHECKOUT the
 * monthly price — so choosing annual advertised a discount the payment never
 * honoured. The saving is a property of the plan now, and the interval is
 * carried all the way into Stripe.
 */
export type BillingInterval = "month" | "year";

export interface AnnualPricing {
  /** Charged once, for twelve months. */
  total: number;
  /** What that works out to per month — the number to compare against price. */
  effectiveMonthly: number;
  /** Cash saved over twelve monthly payments. */
  saved: number;
  /** Whole percent off. */
  percentOff: number;
}

export function annualPricing(plan: FounderPlan | InvestorPlan): AnnualPricing | null {
  if (!plan.annualPrice || plan.price <= 0) return null;
  const monthlyTotal = plan.price * 12;
  const saved = monthlyTotal - plan.annualPrice;
  if (saved <= 0) return null;
  return {
    total: plan.annualPrice,
    // Rounded to the nearest whole currency unit for display; the charge is
    // always plan.annualPrice, never this number × 12.
    effectiveMonthly: Math.round(plan.annualPrice / 12),
    saved,
    percentOff: Math.round((saved / monthlyTotal) * 100),
  };
}

/** The Stripe price env var for a plan at a given interval. */
export function priceEnvKey(plan: FounderPlan | InvestorPlan, interval: BillingInterval): string | null {
  return interval === "year" ? plan.envKeyAnnual : plan.envKey;
}
