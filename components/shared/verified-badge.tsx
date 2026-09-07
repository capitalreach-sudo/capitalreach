"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, Clock, RotateCcw } from "lucide-react";
import { TRUST_LADDER, effectiveTrustLevel, isExpired } from "@/lib/trust";
import { TrustPanel, resolveTrustLevel } from "@/components/shared/trust-panel";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * The trust badge, tiered.
 *
 * "Verified" was one bit, which is the wrong shape for the decision it feeds:
 * an investor about to open a data room needs to know WHAT was checked, not
 * that somebody once approved something. So the badge names the rung and
 * opens onto the evidence behind it.
 *
 * Three silences are deliberate:
 *   - Level 0 renders NOTHING. Absence is the signal; a grey "unverified"
 *     chip scolds every listing that has not queued for review yet.
 *   - An EXPIRED verification is level 0. It never keeps painting the old
 *     claim in a quieter colour -- lapsed is not "verified, slightly".
 *   - Only the owner is told a verification lapsed, because only the owner
 *     can act on it.
 */

const PANEL_W = 320;
const EDGE = 12;

export function VerifiedBadge({
  checks,
  verifiedAt,
  kind = "investor",
  trustLevel,
  trustReviewedAt,
  trustExpiresAt,
  caseOpen = false,
  isOwner = false,
  panel,
}: {
  /** Legacy verification_checks jsonb. */
  checks?: { checks?: string[]; at?: string } | null;
  verifiedAt?: string | null;
  /* The word matters: a company is not a "verified investor". */
  kind?: "startup" | "investor";
  /** startups.trust_level / investors.trust_level. */
  trustLevel?: number | null;
  trustReviewedAt?: string | null;
  trustExpiresAt?: string | null;
  /** A verification_cases row is open for this subject. Never inferred. */
  caseOpen?: boolean;
  /** The viewer owns this subject. Gates the lapse note, nothing else. */
  isOwner?: boolean;
  /** The expanded view. Defaults to a TrustPanel built from these props. */
  panel?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEscapeKey(open, () => setOpen(false));

  // Fixed positioning, clamped to the viewport. The badge sits beside a
  // display-size name, so on a 375px screen an absolutely positioned panel
  // anchored to it hangs off the right edge and scrolls the page sideways.
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(PANEL_W, window.innerWidth - EDGE * 2);
    setPos({
      top: r.bottom + 8,
      left: Math.max(EDGE, Math.min(r.left, window.innerWidth - w - EDGE)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const raw = resolveTrustLevel(trustLevel, verifiedAt);
  const shown = effectiveTrustLevel(raw, trustExpiresAt);
  const expired = raw > 0 && isExpired(trustExpiresAt);

  // A case in flight is the honest middle state: during the founding stage a
  // listing without a badge is usually queued, not rejected. Rendered only
  // when the caller actually knows a case exists.
  if (shown === 0 && caseOpen) {
    return (
      <span style={CHIP_NEUTRAL}>
        <Clock style={{ width: 11, height: 11 }} aria-hidden />
        {t("trust.inProgress")}
      </span>
    );
  }

  if (shown === 0) {
    if (!expired || !isOwner) return null;
    return (
      <span style={CHIP_QUIET}>
        <RotateCcw style={{ width: 11, height: 11 }} aria-hidden />
        {t("trust.reverifyDue")}
      </span>
    );
  }

  const body = panel ?? (
    <TrustPanel
      subject={kind}
      level={trustLevel}
      reviewedAt={trustReviewedAt}
      expiresAt={trustExpiresAt}
      legacyChecks={checks}
      verifiedAt={verifiedAt}
      caseOpen={caseOpen}
      isOwner={isOwner}
    />
  );

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={btnRef}
        type="button"
        className="cr-foil-badge"
        onClick={() => { place(); setOpen((o) => !o); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={CHIP_VERIFIED}
      >
        <BadgeCheck style={{ width: 11, height: 11 }} aria-hidden />
        {t(TRUST_LADDER[shown].key)}
      </button>
      {open && pos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div
            role="dialog"
            aria-label={t("trust.title")}
            style={{
              position: "fixed", top: pos.top, left: pos.left, zIndex: 91,
              width: `min(${PANEL_W}px, calc(100vw - ${EDGE * 2}px))`,
              maxHeight: "min(70vh, 560px)", overflowY: "auto",
              background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
              borderRadius: "4px", padding: "16px",
              boxShadow: "var(--cr-card-shadow-hover)",
              display: "block", textTransform: "none", letterSpacing: "normal",
              fontStyle: "normal",
            }}
          >
            {body}
          </div>
        </>
      )}
    </div>
  );
}

// ── Chips ───────────────────────────────────────────────────────────────────
// One shape for all three states: 3px radius, hairline border, Label type.
// Only the colour changes, and verdigris is reserved for the matured one.

const CHIP_BASE = {
  display: "inline-flex", alignItems: "center", gap: "4px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px",
  borderRadius: "3px", padding: "3px 8px",
  textTransform: "uppercase" as const, letterSpacing: "0.06em",
  whiteSpace: "nowrap" as const,
};

const CHIP_VERIFIED = {
  ...CHIP_BASE,
  background: "color-mix(in srgb, var(--verdigris) 8%, transparent)",
  border: "1px solid color-mix(in srgb, var(--verdigris) 28%, transparent)",
  color: "var(--verdigris)",
  cursor: "pointer",
};

const CHIP_NEUTRAL = {
  ...CHIP_BASE,
  fontWeight: 500,
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  color: "var(--cr-ink-3)",
};

const CHIP_QUIET = {
  ...CHIP_BASE,
  fontWeight: 500,
  background: "transparent",
  border: "1px solid var(--cr-copper-br)",
  color: "var(--cr-copper)",
};
