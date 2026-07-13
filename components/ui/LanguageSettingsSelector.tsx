"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Locale = "en" | "de";

const LOCALE_OPTIONS: { code: Locale; flag: string; name: string; native: string }[] = [
  { code: "en", flag: "🇬🇧", name: "English",  native: "English" },
  { code: "de", flag: "🇩🇪", name: "German",   native: "Deutsch" },
];

export function LanguageSettingsSelector() {
  const router = useRouter();
  const [locale,    setLocale]    = useState<Locale>("en");
  const [switching, setSwitching] = useState(false);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
    if (m && (m[1] === "en" || m[1] === "de")) setLocale(m[1] as Locale);
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
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {LOCALE_OPTIONS.map(opt => {
          const isActive = opt.code === locale;
          return (
            <button
              key={opt.code}
              onClick={() => switchLocale(opt.code)}
              disabled={switching}
              style={{
                display:     "flex",
                alignItems:  "center",
                gap:         "10px",
                padding:     "12px 18px",
                borderRadius: "6px",
                border:      isActive ? "2px solid #B5651D" : "1px solid #D8D0C4",
                background:  isActive ? "rgba(181,101,29,0.05)" : "#F5F0E8",
                cursor:      switching ? "not-allowed" : "pointer",
                fontFamily:  "'DM Sans', sans-serif",
                fontSize:    "14px",
                fontWeight:  isActive ? 600 : 400,
                color:       isActive ? "#B5651D" : "#3D3630",
                transition:  "all 150ms ease",
                opacity:     switching ? 0.7 : 1,
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = "#9C8E82"; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = "#D8D0C4"; }}
            >
              <span style={{ fontSize: "20px", lineHeight: 1 }}>{opt.flag}</span>
              <div style={{ textAlign: "left" }}>
                <div>{opt.native}</div>
                {opt.native !== opt.name && (
                  <div style={{ fontSize: "11px", color: "#9C8E82", fontWeight: 400, marginTop: "1px" }}>{opt.name}</div>
                )}
              </div>
              {isActive && (
                <span style={{ marginLeft: "8px", fontSize: "13px", color: "#B5651D" }}>✓</span>
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
          ✓ Language updated — page will reflect your choice
        </p>
      )}
    </div>
  );
}
