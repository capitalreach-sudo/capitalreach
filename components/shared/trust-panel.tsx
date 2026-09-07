"use client";

import {
  TRUST_LADDER,
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
 * The expanded view behind the badge.
 *
 * A badge is a claim; this is the working. An investor about to open a data
 * room gets the rung this subject stands on, every check it rests on named in
 * words rather than schema slugs, the month each was confirmed and by what
 * method -- and, in the same breath, the sentence saying what we never looked
 * at. A trust surface that only lists its strengths is marketing.
 *
 * It reads nothing. Everything arrives as props, because verification_evidence
 * is service-role only (migration 111) and risk scores never reach a viewer.
 */

// ── Deriving the level ──────────────────────────────────────────────────────

/**
 * Rows verified before the ladder existed carry no trust_level of their own.
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
 * Whether the badge slot paints anything at all. Callers need this before they
 * reserve the slot: at level 0 with no case open the badge is deliberately
 * silent, and an empty wrapper still eats its own margin.
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
  if (args.caseOpen) return true;
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

const VERDIGRIS_DIM = "color-mix(in srgb, var(--verdigris) 65%, var(--cr-ink-4))";

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
  /** An open verification_cases row exists for this subject. */
  caseOpen?: boolean;
  /** The viewer owns this subject: only they see the lapse note. */
  isOwner?: boolean;
}

export function TrustPanel({
  subject, level, reviewedAt, expiresAt, legacyChecks, verifiedAt,
  evidence, caseOpen = false, isOwner = false,
}: TrustPanelProps) {
  const { t } = useTranslation();
  const locale = useLocale();

  const raw = resolveTrustLevel(level, verifiedAt);
  const shown = effectiveTrustLevel(raw, expiresAt);
  const expired = raw > 0 && isExpired(expiresAt);

  // Mono figures, but a month rather than a day: the day a registry answered
  // is precision nobody can act on, and it dates the badge for no reason.
  const month = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(locale, { month: "short", year: "numeric" });
  };

  const grantedAt = reviewedAt ?? legacyChecks?.at ?? verifiedAt ?? null;

  // What was checked, in order of how much the source actually knows: real
  // evidence rows, then an admin's recorded legacy checks, then the ladder
  // itself (a granted level is a promise that its rungs were satisfied).
  const legacyRows: TrustEvidenceRow[] = (legacyChecks?.checks ?? [])
    .map((slug) => ({ kind: LEGACY_KIND[slug] ?? ("other" as EvidenceKind) }));
  const fromLadder = level != null && level > 0;
  // Nothing stands at level 0, lapsed included: a list of checks under an
  // expired verification is the old claim wearing a different hat.
  const rows: TrustEvidenceRow[] = shown === 0 ? []
    : evidence && evidence.length ? evidence
      : (!fromLadder && legacyRows.length) ? legacyRows
      : evidenceChecklist(shown, subject).map((kind) => ({ kind }));

  return (
    <div style={{ display: "block" }}>

      {/* Opener: the rung, and the one line an investor may conclude from it. */}
      <div className="ruled-label" style={{ marginBottom: "12px" }}>
        {t("trust.title")}
      </div>

      <p style={{
        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px",
        lineHeight: 1.25, marginBottom: "8px",
        color: shown > 0 ? "var(--verdigris)" : "var(--cr-ink-2)",
      }}>
        {t(TRUST_LADDER[shown].key)}
      </p>
      <p style={BODY}>{t(TRUST_LADDER[shown].meansKey)}</p>

      {expired && (
        <p style={{ ...DATA, color: "var(--cr-ink-4)", marginTop: "8px" }}>
          {t("trust.expiredOn", { date: month(expiresAt) ?? "" })}
        </p>
      )}
      {caseOpen && shown === 0 && (
        <p style={{ ...BODY, fontWeight: 400, marginTop: "8px" }}>
          {t("trust.caseOpenNote")}
        </p>
      )}

      {/* ── The ladder ─────────────────────────────────────────────────────
          Four rungs, always all four: seeing what was NOT climbed is half of
          what the rung reached actually means. */}
      <div style={{ ...LABEL, marginTop: "24px", marginBottom: "8px" }}>
        {t("trust.ladder")}
      </div>
      <div>
        {([1, 2, 3, 4] as TrustLevel[]).map((rung) => {
          const reached = rung <= shown;
          const current = rung === shown;
          return (
            <div key={rung} style={{
              ...RULE, display: "flex", alignItems: "baseline", gap: "8px",
              padding: "8px 0",
            }}>
              {/* The one decorative glyph the house allows, spent on the one
                  thing worth pointing at: the rung actually reached. */}
              <span aria-hidden style={{
                width: "10px", flexShrink: 0, fontSize: "9px", lineHeight: 1.4,
                color: "var(--verdigris)",
              }}>
                {current ? "✦" : ""}
              </span>
              <span style={{
                ...DATA, width: "20px", flexShrink: 0,
                color: reached ? VERDIGRIS_DIM : "var(--cr-ink-4)",
              }}>
                {String(rung).padStart(2, "0")}
              </span>
              <span style={{
                flex: 1, minWidth: 0,
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: current ? 600 : 400, fontSize: "13px",
                color: reached ? "var(--cr-ink)" : "var(--cr-ink-4)",
              }}>
                {t(TRUST_LADDER[rung].key)}
              </span>
              <span style={{
                ...LABEL, flexShrink: 0, fontSize: "9px",
                color: reached ? VERDIGRIS_DIM : "var(--cr-ink-4)",
              }}>
                {reached ? t("trust.rungConfirmed") : t("trust.rungNotChecked")}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── The checks themselves ──────────────────────────────────────────
          Named the way a person would say them, with the method beside each:
          a DNS proof and a screenshot are not the same evidence. */}
      {rows.length > 0 && (
        <>
          <div style={{ ...LABEL, marginTop: "24px", marginBottom: "8px" }}>
            {t("verify.whatWasChecked")}
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

      {/* ── The honest half ────────────────────────────────────────────────
          Stated on the same surface as the claim, not in a footer nobody
          reaches. Verification is about identity, never about the deal. */}
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
