"use client";

import { useEffect } from "react";
import { formatMoney } from "@/lib/currency";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * The moment a round closes.
 *
 * Closing a deal is the emotional peak of the entire product — months of
 * work, and until now it was marked by a toast that disappeared in four
 * seconds. This is a short, quiet, full-screen acknowledgment: the amount,
 * one line, dismissed by a click or on its own.
 *
 * Deliberately restrained: no confetti physics, no sound. The platform's
 * whole register is "institutional ledger", and the biggest moment should be
 * the calmest thing on it — like a deal bell, not a slot machine.
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
        background: "rgba(26,22,18,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", animation: "cr-fade-in 400ms ease",
      }}>
      <div style={{ textAlign: "center", padding: 24 }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.3em", color: "var(--cr-copper-l)", marginBottom: 18 }}>
          {t("closed.kicker")}
        </p>
        {amount != null && amount > 0 && (
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "clamp(40px, 9vw, 72px)", color: "#F5F0E8", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {formatMoney(amount, currency)}
          </p>
        )}
        <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 600, fontSize: "clamp(17px, 3vw, 24px)", color: "rgba(245,240,232,0.85)", marginTop: 16 }}>
          {counterpartName ? t("closed.lineNamed", { name: counterpartName }) : t("closed.line")}
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 11, color: "rgba(245,240,232,0.4)", marginTop: 28 }}>
          {t("closed.dismiss")}
        </p>
      </div>
    </div>
  );
}
