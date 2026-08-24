"use client";

import { useRef, useState } from "react";
import { BadgeCheck, Check } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * The verified badge, able to say what it means. Click it and it lists the
 * checks this verification stands on and when they were run — a badge that
 * can show its work is a trust signal; one that can't is decoration.
 */
export function VerifiedBadge({ checks, verifiedAt, kind = "investor" }: {
  checks?: { checks?: string[]; at?: string } | null;
  verifiedAt?: string | null;
  /* The word matters: a company is not a "verified investor". */
  kind?: "startup" | "investor";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEscapeKey(open, () => setOpen(false));

  const list = checks?.checks ?? [];
  const when = checks?.at ?? verifiedAt ?? null;

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", color: "var(--cr-up)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", borderRadius: "3px", padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer" }}>
        <BadgeCheck style={{ width: 11, height: 11 }} /> {t(kind === "startup" ? "verify.companyBadge" : "investors.verifiedBadge")}
      </button>
      {open && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <span role="dialog" style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 91,
            width: 240, background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
            borderRadius: 6, padding: "12px 14px", boxShadow: "var(--cr-card-shadow-hover)",
            display: "block", textTransform: "none", letterSpacing: "normal",
          }}>
            <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: "var(--cr-ink)", marginBottom: 8 }}>
              {t("verify.whatWasChecked")}
            </span>
            {(list.length ? list : ["identity"]).map(c => (
              <span key={c} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 12, color: "var(--cr-ink-2)", padding: "2px 0" }}>
                <Check style={{ width: 11, height: 11, color: "var(--cr-up)", flexShrink: 0 }} />
                {t(`verify.check.${c}`)}
              </span>
            ))}
            {when && (
              <span style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--cr-ink-4)", marginTop: 8, borderTop: "1px solid var(--cr-rule)", paddingTop: 8 }}>
                {t("verify.on", { date: formatDate(when) })}
              </span>
            )}
          </span>
        </>
      )}
    </span>
  );
}
