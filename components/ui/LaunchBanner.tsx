"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useLaunchMode } from "@/hooks/useLaunchMode";
import { useTranslation } from "@/hooks/useTranslation";

export function LaunchBanner() {
  const { isLaunch, memberCount, target, loading } = useLaunchMode();
  const { t } = useTranslation();
  const pathname = usePathname();

  // One launch banner per page. /pricing opens with its own stage banner
  // telling the same story in the same numbers, and this banner's CTA links
  // to /pricing, so rendering it there stacks a duplicate above the page's
  // own and links the reader to where they already stand.
  const onPricing = pathname === "/pricing" || pathname?.startsWith("/pricing/");
  if (loading || !isLaunch || onPricing) return null;

  const spotsLeft = Math.max(target - memberCount, 0);

  return (
    <div
      className="launch-banner"
      style={{
        // Paper strip, not an accent slab: this is a status line above the
        // page, and a filled band would outshout every hero below it. The
        // accent lives in the icon and the single link.
        background: "var(--cr-paper-2)",
        borderBottom: "1px solid var(--cr-rule)",
        padding: "8px 20px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        flexWrap: "wrap", textAlign: "center",
      }}
    >
      <Sparkles className="launch-banner-icon" style={{ width: 14, height: 14, color: "var(--cr-copper)", flexShrink: 0 }} />
      {/* Long and short copy both render; globals.css shows one per breakpoint. */}
      <span className="launch-banner-full" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-2)" }}>
        {memberCount > 0 ? t("banner.text", { target, memberCount, spotsLeft }) : t("banner.textZero", { target })}
      </span>
      <span className="launch-banner-short" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-2)" }}>
        {t("banner.textShort", { target, spotsLeft })}
      </span>
      <Link
        href="/pricing"
        style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
          color: "var(--cr-copper)", textDecoration: "underline", whiteSpace: "nowrap",
          // 40px is the smallest thing a thumb hits reliably. The link looks
          // identical; only its hit area grows.
          minHeight: "40px", display: "inline-flex", alignItems: "center",
          padding: "0 4px",
        }}
      >
        {t("banner.cta")} →
      </Link>
    </div>
  );
}
