/**
 * The trust ladder.
 *
 * "Verified" was one bit, granted by an admin's judgement and never revisited.
 * A capital marketplace cannot run on one bit: an investor deciding whether to
 * open a data room needs to know WHAT was checked, WHEN, and by what method.
 * So a subject (a startup or an investor) stands on a level, each level
 * subsuming the ones below it, and the badge names the evidence.
 *
 * Nothing here decides anything on its own. Automated checks gather evidence
 * and raise flags; a human grants the level. A machine may say "look harder",
 * never "this person is a fraud".
 */

export type TrustLevel = 0 | 1 | 2 | 3 | 4;

export type SubjectType = "startup" | "investor";

export interface TrustLevelSpec {
  level: TrustLevel;
  /** i18n key for the badge label. */
  key: string;
  /** Evidence kinds that must have passed for this level to be granted. */
  requires: EvidenceKind[];
  /** What an investor may conclude from it, in one line (i18n key). */
  meansKey: string;
}

export type EvidenceKind =
  | "email_domain" | "domain_control" | "identity_document" | "liveness"
  | "company_registry" | "director_authority" | "bank_account"
  | "accreditation" | "revenue_proof" | "fund_proof" | "reference" | "other";

export type EvidenceMethod =
  | "automated" | "dns_txt" | "registry_api" | "vendor_kyc" | "vendor_screening"
  | "bank_connection" | "manual_upload" | "manual_review";

export type CaseStatus =
  | "draft" | "submitted" | "in_review" | "needs_more"
  | "approved" | "rejected" | "expired" | "revoked";

/**
 * The ladder itself. Levels are cumulative: granting 3 means 1 and 2 were
 * satisfied too, which is why `requires` lists only that rung's new evidence.
 */
export const TRUST_LADDER: Record<TrustLevel, TrustLevelSpec> = {
  0: { level: 0, key: "trust.l0", requires: [],                                      meansKey: "trust.l0means" },
  1: { level: 1, key: "trust.l1", requires: ["domain_control"],                      meansKey: "trust.l1means" },
  2: { level: 2, key: "trust.l2", requires: ["identity_document", "liveness"],       meansKey: "trust.l2means" },
  3: { level: 3, key: "trust.l3", requires: ["company_registry", "director_authority"], meansKey: "trust.l3means" },
  4: { level: 4, key: "trust.l4", requires: ["revenue_proof"],                       meansKey: "trust.l4means" },
};

/** An investor's level 4 rests on different evidence than a founder's. */
export const INVESTOR_LEVEL_4_REQUIRES: EvidenceKind[] = ["accreditation", "fund_proof"];

export function requiredEvidence(level: TrustLevel, subject: SubjectType): EvidenceKind[] {
  if (level === 4 && subject === "investor") return INVESTOR_LEVEL_4_REQUIRES;
  return TRUST_LADDER[level].requires;
}

/** Every rung's evidence, cumulatively, for a level being applied for. */
export function evidenceChecklist(level: TrustLevel, subject: SubjectType): EvidenceKind[] {
  const out: EvidenceKind[] = [];
  for (let l = 1 as TrustLevel; l <= level; l = (l + 1) as TrustLevel) {
    for (const k of requiredEvidence(l, subject)) if (!out.includes(k)) out.push(k);
  }
  return out;
}

// ── Risk scoring ────────────────────────────────────────────────────────────

/**
 * Signals are weighted, summed, and clamped to 0-100. The number routes work:
 * it decides whether a case goes to the fast queue or the careful one, and
 * which cases need a second reviewer. It never auto-rejects, and it is never
 * shown to the applicant -- a published score is a score people optimise
 * against.
 */
export const SIGNAL_WEIGHTS: Record<string, number> = {
  // Identity and contactability
  disposable_email:        25,
  freemail_company_domain: 10,
  domain_registered_recently: 15,
  domain_control_failed:   20,
  // Entity
  registry_not_found:      30,
  registry_dissolved:      40,
  registry_name_mismatch:  20,
  director_not_listed:     25,
  // Behaviour
  duplicate_company:       35,
  duplicate_device:        20,
  signup_velocity:         15,
  ip_country_mismatch:      8,
  // Claims
  impossible_metrics:      30,
  metrics_jump:            15,
  stock_photo_logo:         5,
  // Screening
  sanctions_hit:          100,
  pep_hit:                 40,
  adverse_media:           25,
  // Conduct on the platform
  circumvention_reported:  30,
  complaint_upheld:        35,
};

export interface RiskFlag { signal: string; severity: "info" | "low" | "medium" | "high"; detail?: Record<string, unknown> }

export function scoreRisk(flags: RiskFlag[]): number {
  const total = flags.reduce((sum, f) => sum + (SIGNAL_WEIGHTS[f.signal] ?? 5), 0);
  return Math.max(0, Math.min(100, total));
}

export type ReviewLane = "standard" | "enhanced" | "blocked";

/**
 * Where a case goes. `blocked` is not an automatic rejection -- it is a case
 * that may not be approved by one reviewer alone (a sanctions hit is a legal
 * matter, not a judgement call).
 */
export function reviewLane(score: number, flags: RiskFlag[]): ReviewLane {
  if (flags.some((f) => f.signal === "sanctions_hit")) return "blocked";
  if (score >= 50) return "blocked";
  if (score >= 20) return "enhanced";
  return "standard";
}

// ── Expiry ──────────────────────────────────────────────────────────────────

/** Verification is perishable. Companies change hands; directors resign. */
export const TRUST_VALID_MONTHS = 12;

export function expiryFrom(grantedAt: Date): Date {
  const d = new Date(grantedAt);
  d.setMonth(d.getMonth() + TRUST_VALID_MONTHS);
  return d;
}

export function isExpired(expiresAt: string | null | undefined): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() < Date.now();
}

/**
 * The level to SHOW. An expired verification is not a verified entity, and
 * the badge says so rather than quietly keeping the old claim alive.
 */
export function effectiveTrustLevel(level: number | null | undefined, expiresAt: string | null | undefined): TrustLevel {
  const l = (level ?? 0) as TrustLevel;
  if (l === 0) return 0;
  return isExpired(expiresAt) ? 0 : l;
}

/**
 * Events that invalidate a standing verification and re-open a case. A
 * verified listing that quietly changes its company name is exactly the
 * shape of a hijacked account.
 */
export const REVERIFY_TRIGGERS = [
  "legal_name_changed",
  "company_number_changed",
  "owner_changed",
  "domain_changed",
  "country_changed",
  "expired",
] as const;
export type ReverifyTrigger = (typeof REVERIFY_TRIGGERS)[number];
