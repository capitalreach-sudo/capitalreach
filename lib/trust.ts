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

/** A row of evidence as far as the ladder is concerned. */
export interface EvidenceRecord {
  kind: string;
  status: string;
}

/**
 * Received, or confirmed. A failed attempt is not evidence of anything.
 *
 * The submit gate in /api/verification/case counts a kind as held on exactly
 * this rule, so a surface that reads it differently either blocks a case the
 * server would take or offers one it will refuse.
 */
export function evidenceSupplied(status: string | null | undefined): boolean {
  return status === "passed" || status === "pending";
}

/**
 * One row per kind, for surfaces that show a line per kind.
 *
 * A kind can carry more than one row: the domain proof stores an attempt per
 * domain tried, so an applicant who proves one domain and then mistypes a
 * second ends up with a passing row and a failing one. The case stands on the
 * passing row, so that is the row a checklist has to show, whichever arrived
 * last.
 */
export function evidenceByKind<T extends EvidenceRecord>(rows: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const prev = map.get(row.kind);
    if (!prev || evidenceSupplied(row.status) || !evidenceSupplied(prev.status)) {
      map.set(row.kind, row);
    }
  }
  return map;
}

/** A row of evidence being considered for a later case, and its date. */
export interface CarriedRecord extends EvidenceRecord {
  /** When the check happened, falling back to when the row was written. */
  checkedAt: string | null;
}

/**
 * What a fresh application inherits from the subject's last approved one.
 *
 * Evidence hangs off a case, so a member standing on level 2 opens a level 3
 * application against an empty checklist and is asked to prove their domain a
 * second time -- for a check their badge already rests on. So it travels, under
 * four limits, because the alternative is a badge that renews itself:
 *
 * Only rows that PASSED. A pending upload is a document nobody has read, and a
 * reserved vendor check is a check that has not happened.
 *
 * Only the kinds the granted level stands on. A revenue proof that arrived on a
 * level 4 application which came back granted at 2 was never accepted for level
 * 4, and must not reach it by inheritance.
 *
 * Only while the grant is live, and only while the check itself is. A copy
 * keeps its original date, so the grant test alone would let one proof ride
 * from case to case for as long as the member keeps applying: each approval
 * would renew the badge on a check nobody has repeated. Twelve months from the
 * check, it is asked for again.
 */
export function carriedEvidence<T extends CarriedRecord>(
  rows: readonly T[],
  grant: { levelGranted: number | null | undefined; expiresAt: string | null | undefined },
  subject: SubjectType,
): T[] {
  const level = grant.levelGranted ?? 0;
  if (!Number.isInteger(level) || level < 1 || level > 4) return [];
  if (isExpired(grant.expiresAt)) return [];
  const carries = new Set<string>(evidenceChecklist(level as TrustLevel, subject));
  return rows.filter(
    (row) => row.status === "passed" && carries.has(row.kind) && checkStillValid(row.checkedAt),
  );
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
  // Contact details pushed into a first message: the actual circumvention
  // vector, and often the opening move of an advance-fee approach. A signal
  // for a human, never a block -- founders legitimately swap calendars.
  offplatform_contact:     20,
  nda_bulk_download:       25,
  // A close both parties agreed, an order of magnitude below what they were
  // discussing and below the round itself. Ordinary often enough that it only
  // ever routes a case to a human.
  amount_understated:      20,
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
 * A check is worth what its date says. Same twelve months as a grant, counted
 * from when the check ran rather than from when someone acted on it. An
 * undated check is not one anybody can stand behind.
 */
export function checkStillValid(checkedAt: string | null | undefined): boolean {
  if (!checkedAt) return false;
  const at = new Date(checkedAt);
  if (Number.isNaN(at.getTime())) return false;
  return expiryFrom(at).getTime() > Date.now();
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
