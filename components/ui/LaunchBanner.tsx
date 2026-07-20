"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useLaunchMode } from "@/hooks/useLaunchMode";
import { useTranslation } from "@/hooks/useTranslation";

export function LaunchBanner() {
  const { isLaunch, memberCount, target, loading } = useLaunchMode();
  const { t } = useTranslation();

  if (loading || !isLaunch) return null;

  const spotsLeft = Math.max(target - memberCount, 0);

  return (
    <div
      style={{
        background: "var(--cr-copper)",
        borderBottom: "1px solid var(--cr-copper-d)",
        padding: "8px 20px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        flexWrap: "wrap", textAlign: "center",
      }}
    >
      <Sparkles style={{ width: 14, height: 14, color: "#fff", flexShrink: 0 }} />
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff" }}>
        {t("banner.text", { target, memberCount, spotsLeft })}
      </span>
      <Link
        href="/pricing"
        style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px",
          color: "#fff", textDecoration: "underline", whiteSpace: "nowrap",
        }}
      >
        {t("banner.cta")} →
      </Link>
    </div>
  );
}
