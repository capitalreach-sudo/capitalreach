"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_FLAGS, LOCALE_NAMES } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

export function LanguageSettingsSelector() {
  const router = useRouter();
  const [locale,    setLocale]    = useState<Locale>("en");
  const [switching, setSwitching] = useState(false);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    const m   = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
    const raw = m?.[1] as Locale | undefined;
    if (raw && (LOCALES as string[]).includes(raw)) setLocale(raw);
  }, []);

  async function switchLocale(next: Locale) {
    if (next === locale || switching) return;
    setSwitching(true);
    await fetch("/api/locale", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ locale: next }),
    });
    setLocale(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
    setSwitching(false);
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px" }}>
        {LOCALES.map(code => {
          const isActive = code === locale;
          return (
            <button
              key={code}
              onClick={() => switchLocale(code)}
              disabled={switching}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          "10px",
                padding:      "10px 14px",
                borderRadius: "6px",
                border:       isActive ? "2px solid #B5651D" : "1px solid #D8D0C4",
                background:   isActive ? "rgba(181,101,29,0.05)" : "#F5F0E8",
                cursor:       switching ? "not-allowed" : "pointer",
                fontFamily:   "'DM Sans', sans-serif",
                fontSize:     "13px",
                fontWeight:   isActive ? 600 : 400,
                color:        isActive ? "#B5651D" : "#3D3630",
                transition:   "all 150ms ease",
                opacity:      switching ? 0.7 : 1,
                textAlign:    "left",
              }}
              onMouseEnter={e => { if (!isActive && !switching) (e.currentTarget as HTMLElement).style.borderColor = "#9C8E82"; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = "#D8D0C4"; }}
            >
              <span style={{ fontSize: "18px", lineHeight: 1, flexShrink: 0 }}>{LOCALE_FLAGS[code]}</span>
              <span>{LOCALE_NAMES[code]}</span>
              {isActive && (
                <span style={{ marginLeft: "auto", fontSize: "12px", color: "#B5651D" }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

      {saved && (
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize:   "12px",
          color:      "#2D6A4F",
          marginTop:  "12px",
        }}>
          ✓ Language updated
        </p>
      )}
    </div>
  );
}
