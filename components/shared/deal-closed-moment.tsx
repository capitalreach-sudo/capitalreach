"use client";

import { useEffect } from "react";
import { formatMoney } from "@/lib/currency";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { WaxSeal } from "@/components/ui/WaxSeal";

/**
 * The moment a round closes.
 *
 * Closing a deal is the emotional peak of the entire product -- months of
 * work, and until now it was marked by a toast that disappeared in four
 * seconds. This is a short, quiet, full-screen acknowledgment: the amount,
 * one line, dismissed by a click or on its own.
 *
 * Deliberately restrained: no confetti physics, no sound. The platform's
 * whole register is "institutional ledger", and the biggest moment should be
 * the calmest thing on it -- like a deal bell, not a slot machine.
 */
export function DealClosedMoment({ amount, currency, counterpartName, onDone }: {
  amount: number | null;
  currency: string | null;
  counterpartName: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  useEscapeKey(true, onDone);

  useEffect(() => {
    const id = setTimeout(onDone, 6000);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div role="dialog" aria-modal="true" onClick={onDone}
      style={{
        position: "fixed", inset: 0, zIndex: 120,
        background: "var(--cr-band-bg)",
        borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", animation: "cr-fade-in 400ms ease",
      }}>
      <div style={{ textAlign: "center", padding: 24 }}>
        {/* The stamp lands first: verdigris wax on the biggest moment. */}
        <div style={{ marginBottom: 20 }}>
          <WaxSeal size={88} stamp />
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.3em", color: "var(--cr-copper-l)", marginBottom: 16 }}>
          {t("closed.kicker")}
        </p>
        {amount != null && amount > 0 && (
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "clamp(40px, 9vw, 72px)", color: "var(--cr-band-ink)", letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(amount, currency)}
          </p>
        )}
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(22px, 3vw, 28px)", color: "var(--cr-band-ink)", marginTop: 16, textWrap: "balance" }}>
          {counterpartName ? t("closed.lineNamed", { name: counterpartName }) : t("closed.line")}
        </p>
        {/* The stamp comes down last -- the ledger entry made official. */}
        <span className="cr-stamp cr-stamp-in" style={{ position: "static", display: "inline-block", marginTop: 24, fontSize: 13, padding: "4px 12px", animationDelay: "500ms" }} aria-hidden>
          {t("deals.colClosed")}
        </span>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 11, color: "var(--cr-band-ink-dim)", marginTop: 24 }}>
          {t("closed.dismiss")}
        </p>
      </div>
    </div>
  );
}
