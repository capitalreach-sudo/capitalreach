"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { LOCALES, LOCALE_FLAGS, LOCALE_NAMES, LOCALE_RTL } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

interface Props {
  initialLocale?: Locale;
}

export function LanguageSettingsSelector({ initialLocale }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Locale>(initialLocale ?? "en");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!initialLocale) {
      const m = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
      const raw = m?.[1] as Locale | undefined;
      if (raw && (LOCALES as string[]).includes(raw)) setSelected(raw);
    }
  }, [initialLocale]);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: selected }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {LOCALES.map(locale => (
          <button
            key={locale}
            onClick={() => setSelected(locale)}
            className={`flex items-center gap-3 p-3.5 rounded-[6px] border
                        text-left transition-all duration-150 w-full
                        ${selected === locale
                          ? "border-[#B5651D] bg-[rgba(181,101,29,0.05)]"
                          : "border-[#D8D0C4] bg-[#F5F0E8] hover:bg-[#E4DDD2] hover:border-[#9C8E82]"
                        }`}
          >
            <span className="text-[22px] flex-shrink-0">{LOCALE_FLAGS[locale]}</span>
            <span
              className={`text-[13px] font-medium flex-1 ${
                selected === locale ? "text-[#1A1612]" : "text-[#3D3630]"
              }`}
            >
              {LOCALE_NAMES[locale]}
            </span>
            {LOCALE_RTL.includes(locale) && (
              <span className="text-[9px] text-[#9C8E82] uppercase tracking-[0.06em] flex-shrink-0">
                RTL
              </span>
            )}
            {selected === locale && (
              <Check className="w-4 h-4 text-[#B5651D] flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-[#B5651D] text-white text-[13px]
                     font-semibold rounded-[4px]
                     hover:bg-[#D4842A] active:scale-[0.99]
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all duration-150"
        >
          {saving ? "Saving…" : "Save language"}
        </button>
        {saved && (
          <span className="text-[13px] text-[#2D6A4F] flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            Language updated
          </span>
        )}
      </div>
    </div>
  );
}
