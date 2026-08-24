"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Light / dark, the "terminal" direction that was mocked in the design phase
 * and never shipped.
 *
 * The choice lives in a cookie (cr_theme) rather than localStorage, because
 * the SERVER reads it: the layout stamps data-theme on <html> before any HTML
 * reaches the browser, so there is no flash of the wrong theme on load — the
 * classic failure of client-only toggles. This component only handles the
 * live switch; first paint is always already correct.
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next = dark ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      document.cookie = `cr_theme=${next};path=/;max-age=31536000;SameSite=Lax`;
      setDark(!dark);
    };
    // The new theme ripples out from the button itself — View Transitions
    // where supported, the plain crossfade everywhere else.
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
      aria-label={dark ? t("theme.toLight") : t("theme.toDark")}
      title={dark ? t("theme.toLight") : t("theme.toDark")}
      style={{
        background: "none", border: "none", cursor: "pointer", padding: 6,
        display: "inline-flex", alignItems: "center", color: "var(--cr-ink-3)",
      }}
    >
      {dark ? <Sun style={{ width: 16, height: 16 }} /> : <Moon style={{ width: 16, height: 16 }} />}
    </button>
  );
}
