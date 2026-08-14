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

// Generated Row as the base (same treatment as Deal/Contract/Startup): the
// hand-written version had already drifted -- it was missing account_status
// and the whole suspension column family. role and subscription_tier are the
// DB CHECK-guaranteed unions.
type ProfileRow = import("@/types/supabase").Database["public"]["Tables"]["profiles"]["Row"];
export interface Profile extends Omit<ProfileRow, "role" | "subscription_tier"> {
  role: Role;
  subscription_tier: SubscriptionTier | null;
}

// Generated Row as the base (same treatment as Deal/Contract): the field
// list and nullability come from the schema and cannot drift. Narrowed on
// top: stage/status are DB CHECK-guaranteed unions; subscription_tier's
// CHECK was updated by migration 005 to exactly this union (verified live);
// the two jsonb columns get the shapes the app writes. Joined arrays stay
// optional -- they exist only when the query selects them.
type StartupRow = import("@/types/supabase").Database["public"]["Tables"]["startups"]["Row"];
export interface Startup extends Omit<StartupRow,
  "stage" | "status" | "subscription_tier" | "competitors_json" | "social_proof"> {
  stage: StartupStage;
  status: StartupStatus;
  subscription_tier: SubscriptionTier;
  competitors_json: Array<{ name: string; differentiator: string }>;
  social_proof: Array<{ type: string; value: string }> | null;
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

type InvestorRow = import("@/types/supabase").Database["public"]["Tables"]["investors"]["Row"];
export interface Investor extends Omit<InvestorRow,
  "type" | "stages" | "subscription_tier" | "portfolio_json"> {
  type: InvestorType;
  stages: StartupStage[];
  subscription_tier: SubscriptionTier;
  portfolio_json: Array<{ name: string; stage: string; year: string }>;
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
  /** Set when the counterpart opened the thread (messages/unread POST). */
  read_at?: string | null;
  /** Storage path + human filename when the message carries a file (046). */
  attachment_path?: string | null;
  attachment_name?: string | null;
}

// Based on the generated Row so the field list and nullability can never
// drift from the real schema again -- the hand-written version had already
// diverged (currency nullability, a missing notes column). The one narrowing
// is status: the DB CHECK constrains it to exactly the DealStatus union, so
// this is the database's own guarantee, not a hope.
type DealRow = import("@/types/supabase").Database["public"]["Tables"]["deals"]["Row"];
export interface Deal extends Omit<DealRow, "status"> {
  status: DealStatus;
  startup?: Startup;
  investor?: Investor;
}

export type ContractType   = "term_sheet" | "safe" | "convertible_note" | "nda" | "custom";
export type ContractStatus = "draft" | "sent" | "signed" | "void";

// Same treatment as Deal: generated Row as the base, with the two unions the
// DB CHECK constraints already guarantee narrowed on top.
type ContractRow = import("@/types/supabase").Database["public"]["Tables"]["contracts"]["Row"];
export interface Contract extends Omit<ContractRow, "status" | "contract_type"> {
  status: ContractStatus;
  contract_type: ContractType;
}

export type DealActivityType = "note" | "status_change" | "contract_status" | "nda_signed" | "success_fee";

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
  /** Embedded by the investor dashboard's `startup:startups(name, slug)` select. */
  startup?: Pick<Startup, "name" | "slug"> | null;
}

export interface Watchlist {
  id: string;
  investor_id: string;
  startup_id: string;
  /** Why this was saved. Added in migration 020. */
  note: string | null;
  created_at: string;
  startup?: Startup;
}

// Utility types
export type InvestorTier = "free" | "angel" | "pro_investor" | "institutional";

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

// STARTUP_TIERS / INVESTOR_TIERS lived here: a third copy of the plan tables,
// unreferenced by any code, still quoting $19/$49 and $49/$149 against the
// real $29/$79 and $99/$249, and still naming the removed STRIPE_STARTUP_* /
// STRIPE_INVESTOR_*_PRICE_ID vars. lib/plans.ts is the single source of truth.
