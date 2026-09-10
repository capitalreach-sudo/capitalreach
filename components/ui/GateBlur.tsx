"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface GateBlurProps {
  title:       string;
  description: string;
  ctaLabel?:   string;
  ctaHref?:    string;
  /** When the gate is contractual (an NDA), the CTA acts instead of links. */
  onCta?:      () => void;
  children:    React.ReactNode;
}

export function GateBlur({
  title,
  description,
  ctaLabel,
  ctaHref  = "/pricing",
  onCta,
  children,
}: GateBlurProps) {
  const { t } = useTranslation();
  // A plain <a>-vs-<button> switch: contractual gates act in place.
  const CtaEl = (onCta ? "button" : Link) as React.ElementType;
  return (
    <div style={{ position: "relative", borderRadius: "4px", overflow: "hidden" }}>
      <div
        aria-hidden
        style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none" }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          // Both stops are the page's own paper. The literal cream that used
          // to sit here was the warm light theme's value, so the veil stayed
          // cream over the other three theme combinations.
          background: "linear-gradient(to top, var(--cr-paper) 35%, color-mix(in srgb, var(--cr-paper) 55%, transparent))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Lock style={{ width: 15, height: 15, color: "var(--cr-copper)" }} />
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>
          {title}
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6, maxWidth: "320px" }}>
          {description}
        </p>
        <CtaEl
          {...(onCta ? { onClick: onCta, type: "button" } : { href: ctaHref })}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "var(--cr-copper)", color: "var(--cr-band-ink)",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
            padding: "9px 20px", borderRadius: "4px", textDecoration: "none",
            // The element is a <button> on the contractual path, which brings
            // a default border and arrow cursor the <Link> path never had.
            border: "none", cursor: "pointer",
          }}
        >
          {ctaLabel ?? t("common.viewPlans")} →
        </CtaEl>
      </div>
    </div>
  );
}
