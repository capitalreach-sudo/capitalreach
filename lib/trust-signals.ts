import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-server";
import { optionalEnv } from "@/lib/env";
import { isValidFundingTarget, safeFormatMRR } from "@/lib/validators";
import type { RiskFlag, SubjectType } from "@/lib/trust";

/**
 * The automated half of the trust layer.
 *
 * Every function here gathers evidence or raises a flag for a human. Nothing
 * in this file writes a trust_level, moves a case, or suspends anybody: the
 * detectors return RiskFlag[] for scoreRisk() to weigh and a reviewer to read.
 * A machine may say "look harder", never "this person is a fraud".
 *
 * Service-role only, by construction. trust_signals has RLS enabled with no
 * permissive policy (migration 111), so every write below is reachable
 * exclusively from server code that has already authenticated its caller.
 */

/** trust_signals also accepts a bare account as a subject, before any listing exists. */
export type SignalSubject = SubjectType | "profile";

export type Severity = RiskFlag["severity"];

// ── Recording ───────────────────────────────────────────────────────────────

/**
 * Raise one signal.
 *
 * Never throws, for the same reason notifyUser does not: a signal is a side
 * effect of some real action (a signup, a sweep, an application), and losing
 * the note must not fail the action that produced it. The worst case is a
 * missing row in the watch queue, not a broken submission.
 */
export async function recordSignal(
  subjectType: SignalSubject,
  subjectId: string,
  signal: string,
  severity: Severity = "info",
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("trust_signals").insert({
      subject_type: subjectType,
      subject_id: subjectId,
      signal,
      severity,
      // Round-tripped so an undefined or a Date cannot reject the insert on a
      // jsonb column that supabase-js types as Json.
      detail: JSON.parse(JSON.stringify(detail ?? {})),
    });
    if (error) console.warn(`[trust-signals] insert rejected (${signal}):`, error.message);
  } catch (err) {
    console.warn(`[trust-signals] could not record ${signal}:`, err);
  }
}

/**
 * Persist a detector run, skipping signals already standing unresolved on the
 * subject. Re-raising "duplicate_company" every night would bury the queue in
 * copies of a finding an admin has already read.
 *
 * Returns how many were new.
 */
export async function recordFlags(
  subjectType: SignalSubject,
  subjectId: string,
  flags: RiskFlag[],
): Promise<number> {
  if (!flags.length) return 0;
  const open = await openSignals(subjectType, subjectId);
  const standing = new Set(open.map((f) => f.signal));
  let written = 0;
  for (const flag of flags) {
    if (standing.has(flag.signal)) continue;
    await recordSignal(subjectType, subjectId, flag.signal, flag.severity, flag.detail ?? {});
    standing.add(flag.signal);
    written++;
  }
  return written;
}

/** Unresolved signals on a subject, as flags ready for scoreRisk(). */
export async function openSignals(subjectType: SignalSubject, subjectId: string): Promise<RiskFlag[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("trust_signals")
      .select("signal, severity, detail")
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []).map((row) => ({
      signal: row.signal,
      severity: (row.severity ?? "info") as Severity,
      detail: (row.detail ?? {}) as Record<string, unknown>,
    }));
  } catch {
    return [];
  }
}

// ── Domain-control token ────────────────────────────────────────────────────

/** The TXT record's left-hand side. Also the subdomain we accept the proof on. */
export const DOMAIN_VERIFY_PREFIX = "capitalreach-verify";

/**
 * A verification secret that exists in every environment. VERIFY_TOKEN_SECRET
 * is preferred so the token survives a service-role key rotation; the service
 * key is the fallback so nothing has to be configured for domain proof to
 * work, and the literal is only ever reached in local development where there
 * is no secret to protect.
 */
function tokenSecret(): string {
  return optionalEnv("VERIFY_TOKEN_SECRET") ?? optionalEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "capitalreach-dev-verify";
}

/**
 * The token a case must publish in DNS.
 *
 * Derived, not stored: it is stable for the life of the case (an applicant can
 * leave the record in place and re-run the check next week) and unguessable
 * without the server secret, so nobody can pre-publish a record for a case
 * they do not own. 32 hex characters is 128 bits, which is plenty for a value
 * that also has to be typed into a DNS panel by hand.
 */
export function domainVerifyToken(caseId: string): string {
  return createHmac("sha256", tokenSecret()).update(`domain:${caseId}`).digest("hex").slice(0, 32);
}

/** The whole record value, so the applicant UI and the checker cannot drift. */
export function domainVerifyRecord(caseId: string): string {
  return `${DOMAIN_VERIFY_PREFIX}=${domainVerifyToken(caseId)}`;
}

/** An IP is personal data. login_events holds the raw value for an admin who
 *  needs it; a signal only needs to know that two accounts shared one. */
function ipFingerprint(ip: string): string {
  return createHmac("sha256", tokenSecret()).update(`ip:${ip}`).digest("hex").slice(0, 12);
}

// ── Normalisation ───────────────────────────────────────────────────────────

/** Legal suffixes carry no identity: "Acme Ltd" and "Acme GmbH" are one name. */
const LEGAL_SUFFIXES = new Set([
  "ltd", "ltda", "limited", "llc", "llp", "lp", "inc", "incorporated", "corp", "corporation",
  "co", "company", "gmbh", "ug", "ag", "kg", "ohg", "bv", "nv", "oy", "oyj", "ab", "asa", "as",
  "aps", "sa", "sas", "sarl", "srl", "spa", "plc", "pty", "pte", "sl", "slu", "sp", "zoo",
  "kft", "doo", "ou", "sia", "uab", "ehf", "kk", "gk", "pvt", "private", "holding", "holdings", "group",
]);

/**
 * Fold a company name to what a person would call the same company: no case,
 * no accents, no punctuation, no legal suffix, no leading article.
 */
export function normaliseCompanyName(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  // Repeatedly, and through the conjunction, so "Acme GmbH & Co KG" folds to
  // the same "acme" that "Acme GmbH" does.
  while (words.length > 1 && (LEGAL_SUFFIXES.has(words[words.length - 1]) || words[words.length - 1] === "and")) {
    words.pop();
  }
  if (words.length > 1 && words[0] === "the") words.shift();
  return words.join(" ");
}

/**
 * A hostname from anything a person might paste: a URL, a bare domain, an
 * email address. Returns null when it is not a plausible domain, so callers
 * can refuse rather than look up nonsense.
 */
export function normaliseDomain(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  let d = input.trim().toLowerCase();
  if (d.includes("@")) d = d.slice(d.lastIndexOf("@") + 1);
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  d = d.split(/[/?#]/)[0].split(":")[0];
  d = d.replace(/^www\./, "").replace(/\.$/, "");
  if (d.length < 4 || d.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null;
  return d;
}

/** A registration number is the same number with or without spaces or dots. */
export function normaliseCompanyNumber(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Detector 1: the email address ───────────────────────────────────────────

/**
 * Throwaway mailbox providers. Embedded rather than fetched: a blocklist that
 * depends on a third party is a blocklist that fails open the first time that
 * third party is down, and this list moves slowly enough to live in a deploy.
 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com",
  "grr.la", "10minutemail.com", "10minutemail.net", "20minutemail.com", "tempmail.com",
  "temp-mail.org", "tempmail.net", "tempmailo.com", "minuteinbox.com", "yopmail.com",
  "yopmail.net", "yopmail.fr", "throwawaymail.com", "trashmail.com", "trashmail.de",
  "dispostable.com", "getnada.com", "nada.email", "maildrop.cc", "mailnesia.com",
  "mytemp.email", "fakeinbox.com", "spamgourmet.com", "mailcatch.com", "moakt.com",
  "tempr.email", "emailondeck.com", "discard.email", "spam4.me", "mohmal.com",
  "inboxbear.com", "tempinbox.com", "mailsac.com", "burnermail.io", "email-fake.com",
  "33mail.com", "luxusmail.org", "byom.de", "einrot.com", "fakemail.net",
]);

/**
 * Consumer mailboxes. Never a flag on a person -- most angels really do use
 * Gmail -- and only a weak one on an account standing behind a company, where
 * it means "there is no company domain to prove control of", not "fraud".
 */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.de", "hotmail.com", "hotmail.co.uk",
  "live.com", "msn.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr", "ymail.com", "aol.com",
  "icloud.com", "me.com", "mac.com", "gmx.com", "gmx.de", "gmx.net", "web.de", "mail.com",
  "mail.ru", "yandex.com", "yandex.ru", "protonmail.com", "proton.me", "zoho.com", "qq.com",
  "163.com", "126.com", "naver.com", "orange.fr", "free.fr", "t-online.de", "libero.it",
  "seznam.cz", "wp.pl", "o2.pl",
]);

/** Matches the domain and any parent of it, so mail.mailinator.com counts. */
function inList(domain: string, list: Set<string>): boolean {
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (list.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string" || !email.includes("@")) return null;
  const d = email.trim().toLowerCase().slice(email.lastIndexOf("@") + 1);
  return d.length > 3 && d.includes(".") ? d : null;
}

export function isDisposableDomain(domain: string): boolean {
  return inList(domain, DISPOSABLE_DOMAINS);
}

export function isFreemailDomain(domain: string): boolean {
  return inList(domain, FREEMAIL_DOMAINS);
}

/**
 * Reads one address. `use` decides whether freemail is worth mentioning at
 * all: for a person it is normal, for the account behind a company listing it
 * is the absence of a domain to verify.
 */
export function disposableEmail(email: string | null | undefined, use: "company" | "person" = "person"): RiskFlag | null {
  const domain = emailDomain(email);
  if (!domain) return null;
  if (isDisposableDomain(domain)) {
    return { signal: "disposable_email", severity: "high", detail: { domain } };
  }
  if (use === "company" && isFreemailDomain(domain)) {
    return { signal: "freemail_company_domain", severity: "low", detail: { domain } };
  }
  return null;
}

// ── Detector 2: the same company, listed twice ──────────────────────────────

/**
 * Another live listing with the same folded name. Two founders of the same
 * company both listing it is the innocent case and is worth catching too:
 * whichever it is, one of the two listings should not be there.
 */
export async function duplicateCompany(
  name: string,
  country: string | null | undefined,
  excludeStartupId?: string,
): Promise<RiskFlag | null> {
  const normalised = normaliseCompanyName(name ?? "");
  if (normalised.length < 3) return null;

  // Prefilter in Postgres on the longest word so the comparison set stays
  // small; the fold itself cannot be expressed as a SQL predicate. The token
  // is alphanumeric by construction, so it carries no ilike metacharacters.
  const token = normalised.split(" ").reduce((a, b) => (b.length > a.length ? b : a), "");
  if (token.length < 3) return null;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("startups")
      .select("id, name, slug, country")
      .eq("status", "active")
      .ilike("name", `%${token}%`)
      .limit(200);

    for (const row of data ?? []) {
      if (excludeStartupId && row.id === excludeStartupId) continue;
      if (normaliseCompanyName(row.name) !== normalised) continue;
      const sameCountry = !!country && row.country === country;
      return {
        signal: "duplicate_company",
        // Same name in the same country is one company; the same name in
        // another country is often a genuine unrelated namesake.
        severity: sameCountry ? "high" : "medium",
        detail: { normalised, match_id: row.id, match_slug: row.slug, match_country: row.country, same_country: sameCountry },
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Detector 3: velocity ────────────────────────────────────────────────────

/** Listings by one owner in a day. A second is normal; a third is a pattern. */
const VELOCITY_LISTINGS = 3;
/** Distinct accounts seen from one address. Offices and phone carriers NAT,
 *  so this sits high enough that a shared network is not an accusation. */
const VELOCITY_ACCOUNTS_PER_IP = 4;

export async function signupVelocity(
  ownerId: string,
  ip?: string | null,
  windowHours = 24,
): Promise<RiskFlag | null> {
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
  try {
    const admin = createAdminClient();
    const [startups, investors, sameIp] = await Promise.all([
      admin.from("startups").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).gte("created_at", since),
      admin.from("investors").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).gte("created_at", since),
      ip
        ? admin.from("login_events").select("user_id").eq("ip", ip).gte("created_at", since).limit(500)
        : Promise.resolve({ data: [] as { user_id: string }[] }),
    ]);

    const listings = (startups.count ?? 0) + (investors.count ?? 0);
    const accountsFromIp = new Set((sameIp.data ?? []).map((r) => r.user_id)).size;
    if (listings < VELOCITY_LISTINGS && accountsFromIp < VELOCITY_ACCOUNTS_PER_IP) return null;

    return {
      signal: "signup_velocity",
      // An owner spraying listings is deliberate; a busy IP may be a co-working
      // space, so on its own it stays low.
      severity: listings >= VELOCITY_LISTINGS ? "medium" : "low",
      detail: {
        listings,
        accounts_from_ip: accountsFromIp,
        window_hours: windowHours,
        ...(ip ? { ip_fingerprint: ipFingerprint(ip) } : {}),
      },
    };
  } catch {
    return null;
  }
}

// ── Detector 4: numbers no business has ─────────────────────────────────────

export interface MetricsInput {
  mrr?: number | null;
  arr?: number | null;
  growth_rate?: number | null;
  runway_months?: number | null;
  user_count?: number | null;
  paying_customers?: number | null;
  funding_target?: number | null;
}

/** ARR is a run rate, so a founder mid-month is legitimately off 12x MRR.
 *  Half to one and a half is the band where nobody has to explain themselves. */
const ARR_BAND = { low: 0.5, high: 1.5 };
/** Above this per month, sustained, nothing real is being described. */
const MAX_MONTHLY_GROWTH_PCT = 100;
/** Ten years of runway is not runway, it is a typo or an invention. */
const MAX_RUNWAY_MONTHS = 120;

/** The out-of-range placeholder lib/validators renders. Read from the module
 *  rather than copied, so the MRR ceiling stays defined in exactly one place. */
const OUT_OF_RANGE = safeFormatMRR(null);

/**
 * Claims that contradict each other or the ranges lib/validators already
 * enforces at display time. One flag, several reasons: the weight in
 * SIGNAL_WEIGHTS is for "the numbers do not hold up", and counting it four
 * times over would route a sloppy founder into the blocked lane.
 */
export function impossibleMetrics(startup: MetricsInput): RiskFlag | null {
  const reasons: string[] = [];
  let severe = false;

  const { mrr, arr, growth_rate, runway_months, user_count, paying_customers, funding_target } = startup;

  if (mrr != null && mrr > 0 && safeFormatMRR(mrr) === OUT_OF_RANGE) {
    reasons.push("mrr_out_of_range");
    severe = true;
  }
  if (funding_target != null && funding_target > 0 && !isValidFundingTarget(funding_target)) {
    reasons.push("funding_target_out_of_range");
    severe = true;
  }
  if (mrr != null && mrr > 0 && arr != null && arr > 0) {
    const ratio = arr / (mrr * 12);
    if (ratio < ARR_BAND.low || ratio > ARR_BAND.high) {
      reasons.push("arr_not_twelve_times_mrr");
    }
  }
  if (growth_rate != null && growth_rate > MAX_MONTHLY_GROWTH_PCT) {
    reasons.push("growth_over_100_percent_monthly");
    severe = true;
  }
  if (runway_months != null && runway_months > MAX_RUNWAY_MONTHS) {
    reasons.push("runway_over_120_months");
  }
  if (user_count != null && paying_customers != null && paying_customers > user_count) {
    reasons.push("paying_customers_exceed_users");
    severe = true;
  }

  if (!reasons.length) return null;
  return {
    signal: "impossible_metrics",
    severity: severe ? "high" : "medium",
    detail: { reasons, mrr, arr, growth_rate, runway_months, user_count, paying_customers },
  };
}

// ── The run ─────────────────────────────────────────────────────────────────

export interface RiskSubjectInput {
  subjectType: SubjectType;
  subjectId: string;
  /** The applicant. Read from the subject row when omitted. */
  ownerId?: string | null;
  /** The address to judge. Read from the owner's profile when omitted. */
  email?: string | null;
  /** Request IP of the submission, for velocity. Never stored raw. */
  ip?: string | null;
  /** Signals already standing on the subject or its owner. On by default:
   *  a case should be scored on everything known, not only on today's run. */
  includeOpenSignals?: boolean;
}

/**
 * Run every detector that applies to this subject and hand back the flags.
 *
 * Deliberately returns rather than writes: the caller decides whether this run
 * belongs on a case (risk_flags), in the watch queue (recordFlags), or nowhere
 * at all because it was a preview. Pass the result to scoreRisk() and
 * reviewLane() from lib/trust to route the work.
 */
export async function computeRiskFlags(subject: RiskSubjectInput): Promise<RiskFlag[]> {
  const admin = createAdminClient();
  const flags: RiskFlag[] = [];

  let ownerId = subject.ownerId ?? null;
  let email = subject.email ?? null;
  // Freemail means something different for a firm than for an angel, and an
  // account behind a company listing is always the company case.
  let emailUse: "company" | "person" = "company";

  if (subject.subjectType === "startup") {
    // The financial columns are revoked from client keys (migration 109), so
    // this read is admin-only by necessity -- and never leaves the server: the
    // numbers go into a reason string, not into a response.
    const { data: row } = await admin
      .from("startups")
      .select("id, name, owner_id, country, status, mrr, arr, growth_rate, runway_months, user_count, paying_customers, funding_target")
      .eq("id", subject.subjectId)
      .maybeSingle();
    if (row) {
      ownerId = ownerId ?? row.owner_id;
      const dup = await duplicateCompany(row.name, row.country, row.id);
      if (dup) flags.push(dup);
      const metrics = impossibleMetrics(row);
      if (metrics) flags.push(metrics);
    }
  } else {
    const { data: row } = await admin
      .from("investors")
      .select("id, display_name, firm_name, owner_id, type")
      .eq("id", subject.subjectId)
      .maybeSingle();
    if (row) {
      ownerId = ownerId ?? row.owner_id;
      // An angel is a person and their Gmail address is not a finding.
      emailUse = row.type === "angel" ? "person" : "company";
    }
  }

  if (!email && ownerId) {
    const { data: profile } = await admin.from("profiles").select("email").eq("id", ownerId).maybeSingle();
    email = profile?.email ?? null;
  }
  const mail = disposableEmail(email, emailUse);
  if (mail) flags.push(mail);

  if (ownerId) {
    const velocity = await signupVelocity(ownerId, subject.ip ?? null);
    if (velocity) flags.push(velocity);
  }

  if (subject.includeOpenSignals !== false) {
    const stored = [
      ...(await openSignals(subject.subjectType, subject.subjectId)),
      ...(ownerId ? await openSignals("profile", ownerId) : []),
    ];
    const seen = new Set(flags.map((f) => f.signal));
    for (const flag of stored) {
      // One signal, one weight: a stored duplicate_company must not be scored
      // again on top of the one this run just found.
      if (seen.has(flag.signal)) continue;
      seen.add(flag.signal);
      flags.push(flag);
    }
  }

  return flags;
}
