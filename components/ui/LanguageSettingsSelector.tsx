"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { LOCALES, LOCALE_META } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

interface Props {
  initialLocale?: Locale;
  translations?: {
    save?: string;
    saving?: string;
    languageSaved?: string;
  };
}

export function LanguageSettingsSelector({ initialLocale = "en", translations }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Locale>(initialLocale);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const save = async () => {
    const res = await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: selected }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      startTransition(() => router.refresh());
    }
  };

  const saveLabel = translations?.save ?? "Save language";
  const savingLabel = translations?.saving ?? "Saving…";
  const savedLabel = translations?.languageSaved ?? "Language updated";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {LOCALES.map(locale => {
          const meta = LOCALE_META[locale];
          const active = selected === locale;
          return (
            <button
              key={locale}
              onClick={() => setSelected(locale)}
              className={`flex items-center gap-3 p-3.5 rounded-[6px] border
                          text-left transition-all duration-150 w-full
                          ${active
                            ? "border-[#B5651D] bg-[rgba(181,101,29,0.05)]"
                            : "border-[#D8D0C4] bg-[#F5F0E8] hover:bg-[#E4DDD2] hover:border-[#9C8E82]"
                          }`}
            >
              <span className="text-[22px] flex-shrink-0 leading-none">{meta.flag}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-medium leading-tight ${active ? "text-[#1A1612]" : "text-[#3D3630]"}`}>
                  {meta.native}
                </div>
                <div className="text-[11px] text-[#9C8E82] mt-0.5">{meta.name}</div>
              </div>
              {meta.rtl && (
                <span className="text-[9px] text-[#9C8E82] uppercase tracking-[0.06em] flex-shrink-0">
                  RTL
                </span>
              )}
              {active && <Check className="w-4 h-4 text-[#B5651D] flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={save}
          disabled={isPending}
          className="px-6 py-2.5 bg-[#B5651D] text-white text-[13px]
                     font-semibold rounded-[4px] btn-copper-shimmer
                     hover:bg-[#D4842A] active:scale-[0.99]
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all duration-150"
        >
          {isPending ? savingLabel : saveLabel}
        </button>
        {saved && (
          <span className="text-[13px] text-[#2D6A4F] flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            {savedLabel}
          </span>
        )}
      </div>
    </div>
  );
}
