"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Back to the top of long lists.
 *
 * The directories page in at 24 listings and load more from there, and the
 * filter controls -- the reason anyone scrolled in the first place -- all live
 * at the top. On a phone that is a long flick back with no landmark to aim
 * for. Appears late (900px, well past a first screen) so it never covers
 * content on a short page.
 *
 * Sits above the mobile tab bar and the sticky action bar via --cr-tabbar-h,
 * and is inset from the trailing edge so it never lands under the fee badge.
 */
export function ScrollToTop() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 900);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={t("a11y.backToTop")}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      style={{
        position: "fixed",
        insetInlineStart: "16px",
        bottom: "calc(16px + var(--cr-tabbar-h, 0px))",
        zIndex: 80,
        width: "44px",
        height: "44px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        border: "1px solid var(--cr-rule-dark)",
        background: "var(--cr-paper-2)",
        color: "var(--cr-ink-3)",
        cursor: "pointer",
        boxShadow: "0 6px 18px rgba(26,22,18,0.12)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 180ms ease, transform 180ms ease",
      }}
    >
      <ArrowUp size={18} />
    </button>
  );
}
