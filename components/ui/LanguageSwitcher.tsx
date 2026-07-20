"use client";

import { useState, useRef, useEffect } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { LOCALES, LOCALE_META } from "@/lib/locale";
import type { Locale } from "@/lib/locale";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  currentLocale: Locale;
}

export function LanguageSwitcher({ currentLocale }: Props) {
  const { t } = useTranslation();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LOCALE_META[currentLocale];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const select = async (locale: Locale) => {
    if (locale === currentLocale) { setOpen(false); return; }
    setOpen(false);
    setLoading(true);

    try {
      // Set cookie directly as a backup so it's available before the fetch resolves
      document.cookie = `cr_locale=${locale};path=/;max-age=31536000;SameSite=Lax`;

      const res = await fetch("/api/locale", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ locale }),
      });

      if (res.ok) {
        try { sessionStorage.setItem("just_changed_locale", locale); } catch {}
        // Navigate to same path — forces a full server round-trip reading the new cookie.
        // window.location.reload() can serve a cached response with the old cookie value.
        window.location.href = window.location.pathname;
      } else {
        console.error("Failed to set locale");
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => { if (!loading) setOpen(o => !o); }}
        disabled={loading}
        aria-label={t("locale.currentLangAria", { name: current.name })}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "6px 10px", borderRadius: "4px",
          border: "1px solid transparent",
          background: "transparent", cursor: loading ? "not-allowed" : "pointer",
          transition: "all 150ms", opacity: loading ? 0.55 : 1,
          color: "#6B6056",
        }}
        onMouseEnter={e => {
          if (!loading) {
            (e.currentTarget as HTMLElement).style.background = "#E4DDD2";
            (e.currentTarget as HTMLElement).style.borderColor = "#D8D0C4";
            (e.currentTarget as HTMLElement).style.color = "#1A1612";
          }
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
          (e.currentTarget as HTMLElement).style.color = "#6B6056";
        }}
      >
        {/* Globe or spinner */}
        {loading ? (
          <div style={{
            width: 14, height: 14,
            border: "2px solid #B5651D", borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0,
          }} />
        ) : (
          <Globe style={{ width: 14, height: 14, color: "#B5651D", flexShrink: 0 }} />
        )}

        {/* Flag */}
        <span style={{ fontSize: "15px", lineHeight: 1, flexShrink: 0 }}>
          {current.flag}
        </span>

        {/* Locale code — always uppercase, consistent tracking */}
        <span style={{
          fontSize: "11px", fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500, textTransform: "uppercase",
          letterSpacing: "0.06em", color: "#6B6056",
        }}>
          {currentLocale}
        </span>

        <ChevronDown style={{
          width: 12, height: 12,
          transition: "transform 150ms",
          transform: open ? "rotate(180deg)" : "none",
          flexShrink: 0,
        }} />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />

          <div
            role="listbox"
            aria-label={t("locale.selectLanguage")}
            style={{
              position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50,
              background: "#F5F0E8", border: "1px solid #D8D0C4",
              borderRadius: "6px",
              boxShadow: "0 8px 40px rgba(26,22,18,0.18)",
              width: "220px", maxHeight: "380px", overflowY: "auto",
            }}
          >
            <div style={{
              padding: "8px 16px", borderBottom: "1px solid #E4DDD2",
            }}>
              <span style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                fontSize: "10px", textTransform: "uppercase",
                letterSpacing: "0.08em", color: "#9C8E82",
              }}>
                {t("locale.selectLanguage")}
              </span>
            </div>

            {LOCALES.map(locale => {
              const meta  = LOCALE_META[locale];
              const active = locale === currentLocale;
              return (
                <button
                  key={locale}
                  role="option"
                  aria-selected={active}
                  onClick={() => select(locale)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 16px", textAlign: "left", border: "none", cursor: "pointer",
                    background: active ? "#E4DDD2" : "transparent",
                    color: active ? "#1A1612" : "#3D3630",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#EDE8DE"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? "#E4DDD2" : "transparent"; }}
                >
                  <span style={{ fontSize: "18px", lineHeight: 1, flexShrink: 0 }}>{meta.flag}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: "13px", lineHeight: "1.3",
                      fontWeight: active ? 600 : 400,
                    }}>
                      {meta.native}
                    </div>
                    <div style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: "11px", color: "#9C8E82", marginTop: "1px",
                    }}>
                      {meta.name}
                    </div>
                  </div>
                  {active && <Check style={{ width: 13, height: 13, color: "#B5651D", flexShrink: 0 }} />}
                  {meta.rtl && (
                    <span style={{
                      fontFamily: "'DM Sans', sans-serif", fontSize: "8px",
                      color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0,
                    }}>{t("locale.rtl")}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
