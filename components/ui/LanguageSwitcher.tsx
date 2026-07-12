"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export function LanguageSwitcher() {
  const router = useRouter();
  const [locale, setLocale] = useState<"en" | "de">("en");
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
    if (match && (match[1] === "en" || match[1] === "de")) {
      setLocale(match[1]);
    }
  }, []);

  async function toggle() {
    setSwitching(true);
    const next = locale === "en" ? "de" : "en";
    await fetch("/api/set-locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    setLocale(next);
    router.refresh();
    setSwitching(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={switching}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            "4px",
        fontSize:       "12px",
        fontFamily:     "'DM Sans', sans-serif",
        fontWeight:     500,
        letterSpacing:  "0.05em",
        textTransform:  "uppercase",
        color:          "var(--cr-ink-3)",
        background:     "none",
        border:         "1px solid var(--cr-rule-dark)",
        borderRadius:   "3px",
        padding:        "4px 8px",
        cursor:         switching ? "not-allowed" : "pointer",
        opacity:        switching ? 0.5 : 1,
        transition:     "all 150ms ease",
        lineHeight:     1,
      }}
      onMouseEnter={e => {
        if (!switching) (e.currentTarget as HTMLElement).style.color = "var(--cr-ink)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)";
      }}
      title={locale === "en" ? "Switch to German" : "Auf Englisch wechseln"}
    >
      {locale === "en" ? "DE" : "EN"}
    </button>
  );
}
