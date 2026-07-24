export type Role = "startup" | "investor" | "admin";

export type SubscriptionTier =
  | "free"
  // startup tiers (new)
  | "starter"
  | "growth"
  // investor tiers (new)
  | "angel"
  | "pro_investor"
  | "institutional"
  // legacy tiers (kept for DB compatibility)
  | "listed"
  | "pro"
  | "premium";

export type StartupStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "suspended"
  | "archived";

export type DealStatus =
  | "intro"
  | "due_diligence"
  | "term_sheet"
  | "closed"
  | "passed";

export type StartupStage =
  | "pre-seed"
  | "seed"
  | "series_a"
  | "series_b_plus";

export type InvestorType =
  | "angel"
  | "vc"
  | "family_office"
  | "corporate";

export type ThreadStatus = "active" | "due_diligence" | "archived";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  stripe_customer_id: string | null;
  subscription_tier: SubscriptionTier | null;
  subscription_status: string | null;
  accreditation_certified: boolean;
  created_at: string;
  // Feature 3: investor profile fields (migration 008)
  investment_thesis:    string | null;
  check_size_min:       number | null;
  check_size_max:       number | null;
  preferred_stages:     string[] | null;
  preferred_industries: string[] | null;
  preferred_countries:  string[] | null;
  investor_type:        string | null;
  portfolio_count:      number | null;
  lead_investor:        boolean | null;
  languages:            string[] | null;
}

export interface Startup {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  website: string | null;
  tagline: string;
  description: string | null;
  problem: string | null;
  solution: string | null;
  market: string | null;
  competitive_advantage: string | null;
  stage: StartupStage;
  industry: string;
  country: string;
  funding_target: number;
  equity_offered: number | null;
  min_check_size: number | null;
  use_of_funds: string | null;
  mrr: number | null;
  arr: number | null;
  user_count: number | null;
  growth_rate: number | null;
  status: StartupStatus;
  subscription_tier: SubscriptionTier;
  vaultrise_score: number | null;
  pageviews: number;
  featured: boolean;
  require_nda: boolean;
  demo_video_url: string | null;
  created_at: string;
  updated_at: string;
  // Extended fields (added in migration 004)
  founded_date: string | null;
  city: string | null;
  business_model: string | null;
  revenue_model: string | null;
  team_size: string | null;
  company_type: string | null;
  churn_rate: number | null;
  paying_customers: number | null;
  pitch_deck_url: string | null;
  product_hunt_url: string | null;
  twitter_url: string | null;
  runway_months: number | null;
  competitors_json: Array<{ name: string; differentiator: string }>;
  // Feature 3: rich profile fields (migration 008)
  target_markets:   string[] | null;
  languages:        string[] | null;
  previous_funding: number | null;
  lead_investor:    string | null;
  deck_language:    string | null;
  video_pitch_url:  string | null;
  social_proof:     Array<{ type: string; value: string }> | null;
  looking_for:      string[] | null;
  // joined
  founders?: StartupFounder[];
  documents?: StartupDocument[];
  milestones?: StartupMilestone[];
}

export interface StartupFounder {
  id: string;
  startup_id: string;
  name: string;
  role: string;
  linkedin_url: string | null;
  twitter_url: string | null;
  photo_url: string | null;
  bio: string | null;
}

export interface StartupDocument {
  id: string;
  startup_id: string;
  type: "pitch_deck" | "financial_model" | "cap_table" | "other";
  file_url: string;
  label: string;
  requires_nda: boolean;
}

export interface StartupMilestone {
  id: string;
  startup_id: string;
  date: string;
  description: string;
}

export interface Investor {
  id: string;
  owner_id: string;
  slug: string;
  type: InvestorType;
  bio: string | null;
  linkedin_url: string | null;
  industries: string[];
  stages: StartupStage[];
  min_check: number | null;
  max_check: number | null;
  geography: string[];
  subscription_tier: SubscriptionTier;
  created_at: string;
  // Extended fields (added in migration 004)
  display_name: string | null;
  firm_name: string | null;
  website: string | null;
  twitter_url: string | null;
  investment_thesis: string | null;
  aum: string | null;
  portfolio_json: Array<{ name: string; stage: string; year: string }>;
  follow_on_policy: string | null;
  board_seat_pref: string | null;
  lead_rounds: boolean;
  number_of_investments: number | null;
  avg_hold_period: string | null;
}

export interface Thread {
  id: string;
  startup_id: string;
  investor_id: string | null;
  recipient_startup_id: string | null;
  status: ThreadStatus;
  created_at: string;
  updated_at: string;
  startup?: Startup;
  investor?: Investor;
  recipient_startup?: Startup;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Deal {
  id: string;
  startup_id: string;
  investor_id: string;
  amount: number | null;
  currency: string | null;
  status: DealStatus;
  success_fee_invoiced: boolean;
  stripe_invoice_id: string | null;
  created_at: string;
  updated_at: string;
  startup?: Startup;
  investor?: Investor;
}

export type ContractType   = "term_sheet" | "safe" | "convertible_note" | "nda" | "custom";
export type ContractStatus = "draft" | "sent" | "signed" | "void";

export interface Contract {
  id: string;
  deal_id: string;
  startup_id: string;
  investor_id: string;
  created_by: string;
  title: string;
  contract_type: ContractType;
  amount: number | null;
  currency: string | null;
  equity_percent: number | null;
  terms: string | null;
  status: ContractStatus;
  created_at: string;
  updated_at: string;
}

export type DealActivityType = "note" | "status_change" | "contract_status" | "nda_signed";

export interface DealActivity {
  id: string;
  type: DealActivityType;
  body: string | null;
  created_at: string;
  actor: { full_name: string | null } | null;
}

export interface NdaRecord {
  id: string;
  startup_id: string;
  investor_id: string;
  docusign_envelope_id: string | null;
  signed_at: string | null;
}

export interface AiReport {
  id: string;
  investor_id: string;
  startup_id: string;
  type: "due_diligence" | "startup_score" | "pitch_feedback" | "match";
  content: string;
  stripe_charge_id: string | null;
  created_at: string;
}

export interface Watchlist {
  id: string;
  investor_id: string;
  startup_id: string;
  created_at: string;
  startup?: Startup;
}

// Utility types
export type InvestorTier = "free" | "angel" | "pro_investor" | "institutional";

export function canAccessFinancials(tier: SubscriptionTier | null): boolean {
  return tier === "angel" || tier === "pro_investor" || tier === "institutional";
}

export function canSendMessages(tier: SubscriptionTier | null): boolean {
  return tier === "angel" || tier === "pro_investor" || tier === "institutional";
}

export function canGetAiDueDiligence(tier: SubscriptionTier | null): boolean {
  return tier === "pro_investor" || tier === "institutional";
}

export function canExportData(tier: SubscriptionTier | null): boolean {
  return tier === "pro_investor" || tier === "institutional";
}

export function canGetAiPitchFeedback(tier: SubscriptionTier | null): boolean {
  return tier === "growth" || tier === "starter";
}

export const INDUSTRIES = [
  "AI / Machine Learning",
  "B2B SaaS",
  "Consumer",
  "Crypto / Web3",
  "EdTech",
  "FinTech",
  "HealthTech",
  "HRTech",
  "LegalTech",
  "PropTech",
  "Climate / CleanTech",
  "E-commerce",
  "Gaming",
  "Marketplace",
  "DeepTech",
  "Biotech",
  "SpaceTech",
  "AgriTech",
  "Cybersecurity",
  "Other",
] as const;

export const STAGES: { value: StartupStage; label: string }[] = [
  { value: "pre-seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b_plus", label: "Series B+" },
];

export const STARTUP_TIERS = {
  free:    { name: "Free",    price: 0,  priceId: null },
  starter: { name: "Starter", price: 19, priceId: process.env.STRIPE_STARTUP_STARTER_PRICE_ID },
  growth:  { name: "Growth",  price: 49, priceId: process.env.STRIPE_STARTUP_GROWTH_PRICE_ID },
  // legacy kept for DB compatibility
  listed:  { name: "Starter", price: 19, priceId: process.env.STRIPE_STARTUP_STARTER_PRICE_ID },
  pro:     { name: "Growth",  price: 49, priceId: process.env.STRIPE_STARTUP_GROWTH_PRICE_ID },
  premium: { name: "Growth",  price: 49, priceId: process.env.STRIPE_STARTUP_GROWTH_PRICE_ID },
} as const;

export const INVESTOR_TIERS = {
  free:         { name: "Explorer",     price: 0,   priceId: null },
  angel:        { name: "Angel",        price: 49,  priceId: process.env.STRIPE_INVESTOR_ANGEL_PRICE_ID },
  pro_investor: { name: "Pro",          price: 149, priceId: process.env.STRIPE_INVESTOR_PRO_PRICE_ID },
  institutional: { name: "Institutional", price: 0,  priceId: null },
} as const;
