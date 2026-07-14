"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Check, ChevronDown } from "lucide-react";
import { LOCALES, LOCALE_META } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

interface Props {
  currentLocale: Locale;
}

export function LanguageSwitcher({ currentLocale }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const current = LOCALE_META[currentLocale];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const select = async (locale: Locale) => {
    if (locale === currentLocale) { setOpen(false); return; }
    setOpen(false);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        aria-label={`Current language: ${current.name}. Click to change.`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px]
                   text-[#6B6056] hover:text-[#1A1612] hover:bg-[#E4DDD2]
                   border border-transparent hover:border-[#D8D0C4]
                   transition-all duration-150 text-[12px] font-medium
                   disabled:opacity-40 select-none"
      >
        {isPending ? (
          <div className="w-3.5 h-3.5 border-2 border-[#B5651D]
                          border-t-transparent rounded-full animate-spin" />
        ) : (
          <Globe className="w-3.5 h-3.5 flex-shrink-0 text-[#B5651D]" />
        )}
        <span className="text-[15px] leading-none">{current.flag}</span>
        <span className="uppercase tracking-[0.05em] text-[11px]">
          {currentLocale}
        </span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label="Select language"
            className="absolute right-0 top-[calc(100%+6px)] z-50
                       bg-[#F5F0E8] border border-[#D8D0C4] rounded-[8px]
                       shadow-[0_8px_40px_rgba(26,22,18,0.18)]
                       overflow-hidden w-[220px]
                       max-h-[380px] overflow-y-auto"
          >
            <div className="px-4 py-2 border-b border-[#E4DDD2]">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#9C8E82]">
                Select language
              </span>
            </div>
            {LOCALES.map(locale => {
              const meta = LOCALE_META[locale];
              const active = locale === currentLocale;
              return (
                <button
                  key={locale}
                  role="option"
                  aria-selected={active}
                  onClick={() => select(locale)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5
                              text-left transition-colors duration-100
                              ${active
                                ? "bg-[#E4DDD2] text-[#1A1612]"
                                : "text-[#3D3630] hover:bg-[#EDE8DE]"
                              }`}
                >
                  <span className="text-[18px] flex-shrink-0 leading-none">{meta.flag}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] leading-tight ${active ? "font-semibold" : "font-normal"}`}>
                      {meta.native}
                    </div>
                    <div className="text-[11px] text-[#9C8E82] mt-0.5">{meta.name}</div>
                  </div>
                  {active && <Check className="w-3.5 h-3.5 text-[#B5651D] flex-shrink-0" />}
                  {meta.rtl && (
                    <span className="text-[8px] text-[#9C8E82] uppercase tracking-[0.06em] flex-shrink-0">
                      RTL
                    </span>
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
