"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { effectiveTrustLevel, isExpired } from "@/lib/trust";
import { TrustPanel, resolveTrustLevel } from "@/components/shared/trust-panel";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * The record chip.
 *
 * The house does not vouch for a member. A tick beside a name is the platform
 * standing behind a company an investor may lose money on, and that is a
 * representation, not a summary; so this chip says only that documents are on
 * file and opens the list of them. What the reader concludes from a registry
 * extract is the reader's own judgement, which is where it belongs.
 *
 * Four silences are deliberate:
 *   - Nothing on file renders NOTHING. Absence is the signal; a grey chip
 *     scolds every listing that has not sent anything in yet.
 *   - A LAPSED record is nothing on file. It never keeps painting the old
 *     entry in a quieter colour.
 *   - A case in flight paints nothing either. That the house is reading
 *     someone's documents is not a fact about that someone.
 *   - Only the owner is told a record lapsed, because only the owner can act
 *     on it.
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
  /** Decides which documents the record is read against. */
  kind?: "startup" | "investor";
  /** startups.trust_level / investors.trust_level. */
  trustLevel?: number | null;
  trustReviewedAt?: string | null;
  trustExpiresAt?: string | null;
  /** A verification_cases row is open for this subject. Never stated here. */
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

  // Fixed positioning, clamped to the viewport. The chip sits beside a
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

  if (shown === 0) {
    if (!expired || !isOwner) return null;
    return (
      <span style={CHIP_QUIET}>
        <RotateCcw style={{ width: 11, height: 11 }} aria-hidden />
        {t("trust.renewalDue")}
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
        onClick={() => { place(); setOpen((o) => !o); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={CHIP_RECORD}
      >
        {t("trust.onFile")}
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
// One shape for both states: 3px radius, hairline border, Label type. Ink, not
// green -- a colour that means "good" is the endorsement the words avoid, and
// copper is spent on the one state that asks the owner to do something.

const CHIP_BASE = {
  display: "inline-flex", alignItems: "center", gap: "4px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  borderRadius: "3px", padding: "3px 8px",
  textTransform: "uppercase" as const, letterSpacing: "0.06em",
  whiteSpace: "nowrap" as const,
};

const CHIP_RECORD = {
  ...CHIP_BASE,
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  color: "var(--cr-ink-3)",
  cursor: "pointer",
};

const CHIP_QUIET = {
  ...CHIP_BASE,
  background: "transparent",
  border: "1px solid var(--cr-copper-br)",
  color: "var(--cr-copper)",
};
