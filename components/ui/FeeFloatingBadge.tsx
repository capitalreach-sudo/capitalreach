"use client";

import { useTranslation } from "@/hooks/useTranslation";

import { useEffect, useState } from "react";
import Link from "next/link";

export function FeeFloatingBadge() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Link
      href="/pricing"
      className={`fee-floating-badge ${visible ? "fee-floating-badge-visible" : ""}`}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <span className="fee-floating-badge-diamond">◆</span>
      <span>{t("feeBadge.floating")}</span>
    </Link>
  );
}
