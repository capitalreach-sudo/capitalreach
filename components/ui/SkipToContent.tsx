"use client";

import { useTranslation } from "@/hooks/useTranslation";

/**
 * The first thing in the tab order on every page.
 *
 * The Navbar is mounted per page rather than in the layout, and it carries
 * roughly a dozen focusable elements before any content. Rather than add an
 * id to thirty page files, this finds the first <main> at click time and moves
 * focus there -- so it keeps working for pages added later without anyone
 * having to remember a convention.
 */
export function SkipToContent() {
  const { t } = useTranslation();

  return (
    <a
      href="#"
      className="cr-skip"
      onClick={(e) => {
        e.preventDefault();
        const main = document.querySelector("main");
        if (!main) return;
        // <main> is not focusable by default; -1 accepts programmatic focus
        // without inserting it into the tab order for everyone else.
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.focus();
        main.scrollIntoView({ block: "start" });
      }}
    >
      {t("a11y.skipToContent")}
    </a>
  );
}
