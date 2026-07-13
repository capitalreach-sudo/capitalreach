"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

type Locale = "en" | "de";

const LOCALE_OPTIONS: { code: Locale; flag: string; name: string }[] = [
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
];

export function LanguageSwitcher() {
  const router  = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [locale,    setLocale]    = useState<Locale>("en");
  const [open,      setOpen]      = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
    if (m && (m[1] === "en" || m[1] === "de")) setLocale(m[1] as Locale);
  }, []);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function switchLocale(next: Locale) {
    if (next === locale || switching) return;
    setSwitching(true);
    setOpen(false);
    await fetch("/api/locale", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ locale: next }),
    });
    setLocale(next);
    router.refresh();
    setSwitching(false);
  }

  const current = LOCALE_OPTIONS.find(o => o.code === locale)!;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={switching}
        aria-label="Select language"
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "5px",
          fontSize:   "14px",
          color:      "#9C8E82",
          background: "none",
          border:     "none",
          cursor:     switching ? "not-allowed" : "pointer",
          opacity:    switching ? 0.5 : 1,
          padding:    "4px 2px",
          transition: "color 150ms ease",
          lineHeight: 1,
        }}
        onMouseEnter={e => !switching && ((e.currentTarget as HTMLElement).style.color = "#1A1612")}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#9C8E82")}
      >
        <Globe size={15} strokeWidth={1.5} />
        <span style={{ lineHeight: 1, fontSize: "15px" }}>{current.flag}</span>
      </button>

      {open && (
        <div
          style={{
            position:     "absolute",
            right:        0,
            top:          "calc(100% + 10px)",
            background:   "#EDE8DE",
            border:       "1px solid rgba(26,22,18,0.2)",
            borderRadius: "6px",
            boxShadow:    "0 8px 24px rgba(26,22,18,0.14)",
            padding:      "4px",
            minWidth:     "140px",
            zIndex:       200,
          }}
        >
          {LOCALE_OPTIONS.map(opt => {
            const isActive = opt.code === locale;
            return (
              <button
                key={opt.code}
                onClick={() => switchLocale(opt.code)}
                style={{
                  display:     "flex",
                  alignItems:  "center",
                  gap:         "8px",
                  width:       "100%",
                  padding:     "8px 10px",
                  borderRadius: "4px",
                  border:      "none",
                  background:  isActive ? "#E4DDD2" : "transparent",
                  cursor:      "pointer",
                  fontFamily:  "'DM Sans', sans-serif",
                  fontSize:    "13px",
                  fontWeight:  isActive ? 600 : 400,
                  color:       isActive ? "#B5651D" : "#1A1612",
                  textAlign:   "left",
                  transition:  "background 120ms ease",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#E4DDD2"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: "16px", lineHeight: 1 }}>{opt.flag}</span>
                <span>{opt.name}</span>
                {isActive && (
                  <span style={{ marginLeft: "auto", fontSize: "11px", color: "#B5651D" }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
