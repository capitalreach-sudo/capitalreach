"use client";

import {
  effectiveTrustLevel,
  evidenceChecklist,
  isExpired,
  type EvidenceKind,
  type EvidenceMethod,
  type SubjectType,
  type TrustLevel,
} from "@/lib/trust";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocale } from "@/components/providers/locale-provider";
import type { CSSProperties } from "react";

/**
 * The record behind the chip.
 *
 * What this states is what the house holds: the documents a member supplied,
 * the month each was taken, and by what method. It does not grade the member.
 * A rung, a tick or a score is the house vouching, and vouching is a
 * representation an investor may rely on and later sue over; a dated list of
 * what arrived is a fact, and a fact is defensible.
 *
 * The sentence saying what none of it means sits on the same surface as the
 * list, not in a footer nobody reaches.
 *
 * It reads nothing. Everything arrives as props, because verification_evidence
 * is service-role only (migration 111) and risk scores never reach a viewer.
 */

// ── Deriving the level ──────────────────────────────────────────────────────

/**
 * Rows reviewed before the ladder existed carry no trust_level of their own.
 * Migration 111 settles those at 2 -- an admin did look at a human, but no
 * registry lookup or financial evidence was ever collected, so they are not
 * credited with rungs nobody climbed.
 */
const LEGACY_VERIFIED_LEVEL: TrustLevel = 2;

export function resolveTrustLevel(
  level: number | null | undefined,
  verifiedAt: string | null | undefined,
): TrustLevel {
  if (level != null && level > 0) {
    return Math.min(4, Math.max(0, Math.round(level))) as TrustLevel;
  }
  return verifiedAt ? LEGACY_VERIFIED_LEVEL : 0;
}

/**
 * Whether the chip slot paints anything at all. Callers need this before they
 * reserve the slot: with nothing on file the slot is deliberately silent, and
 * an empty wrapper still eats its own margin.
 *
 * `caseOpen` is accepted and deliberately does not open the slot. That a case
 * is in flight says the house is looking at someone, which is a fact about the
 * house rather than about the member, and it reads to a stranger as a promise
 * that a verdict is coming.
 */
export function trustBadgeVisible(args: {
  level?: number | null;
  verifiedAt?: string | null;
  expiresAt?: string | null;
  caseOpen?: boolean;
  isOwner?: boolean;
}): boolean {
  const raw = resolveTrustLevel(args.level, args.verifiedAt);
  if (effectiveTrustLevel(raw, args.expiresAt) > 0) return true;
  // Lapsed, and only the owner is told: a stranger sees plain absence.
  return raw > 0 && !!args.isOwner;
}

// ── Evidence presentation ───────────────────────────────────────────────────

export interface TrustEvidenceRow {
  kind: EvidenceKind;
  method?: EvidenceMethod | null;
  /** ISO timestamp the check passed. */
  checkedAt?: string | null;
}

/**
 * How each kind is checked when the caller has no evidence rows to hand. These
 * mirror the pipeline: domain control is a DNS record, identity goes to a KYC
 * vendor, the entity comes from a company register.
 */
const DEFAULT_METHOD: Record<EvidenceKind, EvidenceMethod> = {
  email_domain:       "automated",
  domain_control:     "dns_txt",
  identity_document:  "vendor_kyc",
  liveness:           "vendor_kyc",
  company_registry:   "registry_api",
  director_authority: "registry_api",
  bank_account:       "bank_connection",
  accreditation:      "manual_review",
  revenue_proof:      "manual_review",
  fund_proof:         "manual_review",
  reference:          "manual_review",
  other:              "manual_review",
};

/** The pre-ladder verification_checks vocabulary, in ladder terms. */
const LEGACY_KIND: Record<string, EvidenceKind> = {
  identity: "identity_document",
  registry: "company_registry",
  domain:   "domain_control",
  metrics:  "revenue_proof",
};

// ── House register primitives ───────────────────────────────────────────────

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const DATA: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
  fontWeight: 500, fontSize: "11px", letterSpacing: "0.02em",
};

const BODY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  lineHeight: 1.65, color: "var(--cr-ink-3)",
};

const RULE: CSSProperties = { borderTop: "1px solid var(--cr-rule)" };

export interface TrustPanelProps {
  subject: SubjectType;
  /** Raw trust_level from startups/investors. */
  level?: number | null;
  /** trust_reviewed_at: when the level was granted. */
  reviewedAt?: string | null;
  /** trust_expires_at. */
  expiresAt?: string | null;
  /** Legacy verification_checks jsonb and verified_at, still on both tables. */
  legacyChecks?: { checks?: string[]; at?: string } | null;
  verifiedAt?: string | null;
  /** Real evidence rows, when the caller is entitled to them. Never fetched here. */
  evidence?: TrustEvidenceRow[] | null;
  /** An open verification_cases row exists. Taken, and deliberately unstated. */
  caseOpen?: boolean;
  /** The viewer owns this subject: only they see the lapse note. */
  isOwner?: boolean;
}

export function TrustPanel({
  subject, level, reviewedAt, expiresAt, legacyChecks, verifiedAt,
  evidence, isOwner = false,
}: TrustPanelProps) {
  const { t } = useTranslation();
  const locale = useLocale();

  const raw = resolveTrustLevel(level, verifiedAt);
  const shown = effectiveTrustLevel(raw, expiresAt);
  const expired = raw > 0 && isExpired(expiresAt);

  // Mono figures, but a month rather than a day: the day a registry answered
  // is precision nobody can act on, and it dates the record for no reason.
  const month = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(locale, { month: "short", year: "numeric" });
  };

  const grantedAt = reviewedAt ?? legacyChecks?.at ?? verifiedAt ?? null;

  // What arrived, in order of how much the source actually knows: real
  // evidence rows, then an admin's recorded legacy checks, then the ladder
  // itself (a granted level rests on a known set of documents).
  const legacyRows: TrustEvidenceRow[] = (legacyChecks?.checks ?? [])
    .map((slug) => ({ kind: LEGACY_KIND[slug] ?? ("other" as EvidenceKind) }));
  const fromLadder = level != null && level > 0;
  // Nothing is listed once the record has lapsed: a year-old list under a
  // lapsed entry reads as current, which is the old claim in another hat.
  const rows: TrustEvidenceRow[] = shown === 0 ? []
    : evidence && evidence.length ? evidence
      : (!fromLadder && legacyRows.length) ? legacyRows
      : evidenceChecklist(shown, subject).map((kind) => ({ kind }));

  return (
    <div style={{ display: "block" }}>

      {/* Opener: what this list is, and the limit of it, before the list. */}
      <div className="ruled-label" style={{ marginBottom: "12px" }}>
        {t("trust.title")}
      </div>

      <p style={BODY}>{t("trust.recordsLede")}</p>

      {expired && (
        <p style={{ ...DATA, color: "var(--cr-ink-4)", marginTop: "8px" }}>
          {t("trust.expiredOn", { date: month(expiresAt) ?? "" })}
        </p>
      )}

      {/* ── The record ─────────────────────────────────────────────────────
          Each line names a document the way a person would say it, with the
          method beside it: a DNS proof and a scanned page are not the same
          thing, and the difference is the reader's to weigh, not ours. */}
      {rows.length === 0 ? (
        <p style={{ ...BODY, marginTop: "12px" }}>{t("trust.noneOnFile")}</p>
      ) : (
        <>
          <div style={{ ...LABEL, marginTop: "24px", marginBottom: "8px" }}>
            {t("trust.supplied")}
          </div>
          <div>
            {rows.map((row, i) => {
              const when = month(row.checkedAt ?? grantedAt);
              return (
                <div key={`${row.kind}-${i}`} style={{
                  ...RULE, display: "flex", alignItems: "baseline",
                  justifyContent: "space-between", gap: "12px", padding: "8px 0",
                }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{
                      display: "block", fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-2)",
                    }}>
                      {t(`trust.ev.${row.kind}`)}
                    </span>
                    <span style={{ ...LABEL, display: "block", fontSize: "9px", marginTop: "2px" }}>
                      {t(`trust.method.${row.method ?? DEFAULT_METHOD[row.kind]}`)}
                    </span>
                  </span>
                  {when && (
                    <span style={{ ...DATA, color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                      {when}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Perishable by design: a company changes hands, a director resigns. */}
      {!expired && month(expiresAt) && (
        <p style={{ ...DATA, ...RULE, color: "var(--cr-ink-4)", paddingTop: "8px", marginTop: "0" }}>
          {t("trust.validTo", { date: month(expiresAt) ?? "" })}
        </p>
      )}

      {/* ── The limit ──────────────────────────────────────────────────────
          On the same surface as the list, not in a footer nobody reaches. A
          document on file says who the house corresponded with. It says
          nothing about the business, and this is where that is said. */}
      <div style={{ ...LABEL, marginTop: "24px", marginBottom: "8px" }}>
        {t("trust.notCheckedTitle")}
      </div>
      <p style={BODY}>{t("trust.notChecked")}</p>

      {isOwner && expired && (
        <p style={{
          ...RULE, ...BODY, marginTop: "16px", paddingTop: "12px",
          fontWeight: 500, color: "var(--cr-copper)",
        }}>
          {t("trust.reverifyNote")}
        </p>
      )}
    </div>
  );
}
