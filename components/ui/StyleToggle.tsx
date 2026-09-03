"use client";

import { useEffect, useState } from "react";
import { Briefcase, Feather } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Editorial / business, the product's two visual registers.
 *
 * Editorial is the warm-paper serif identity the product launched with;
 * business is the neutral slate-and-navy register that reads like enterprise
 * software. Both exist because both audiences exist: the founder who liked the
 * personality, and the investor who wants it to look like where money lives.
 *
 * Same architecture as ThemeToggle: the choice lives in the cr_style cookie
 * (the SERVER reads it and stamps data-style on <html> before the first byte,
 * so the first paint is always already correct); this component only performs
 * the live switch.
 */
export function StyleToggle() {
  const { t } = useTranslation();
  const [business, setBusiness] = useState(false);

  useEffect(() => {
    setBusiness(document.documentElement.dataset.style === "business");
  }, []);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next = business ? "editorial" : "business";
    const apply = () => {
      document.documentElement.dataset.style = next;
      document.cookie = `cr_style=${next};path=/;max-age=31536000;SameSite=Lax`;
      setBusiness(!business);
    };
    const root = document.documentElement;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const r = e.currentTarget.getBoundingClientRect();
      root.style.setProperty("--vt-x", `${r.left + r.width / 2}px`);
      root.style.setProperty("--vt-y", `${r.top + r.height / 2}px`);
      doc.startViewTransition(apply);
    } else {
      apply();
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={business ? t("style.toEditorial") : t("style.toBusiness")}
      title={business ? t("style.toEditorial") : t("style.toBusiness")}
      style={{
        background: "none", border: "none", cursor: "pointer", padding: 6,
        display: "inline-flex", alignItems: "center", color: "var(--cr-ink-3)",
      }}
    >
      {business ? <Feather style={{ width: 16, height: 16 }} /> : <Briefcase style={{ width: 16, height: 16 }} />}
    </button>
  );
}
