"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { LOCALES, LOCALE_META } from "@/lib/locale";
import type { Locale } from "@/lib/locale";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";

interface Props {
  initialLocale?: Locale;
  translations?: {
    save?: string;
    saving?: string;
    languageSaved?: string;
  };
}

export function LanguageSettingsSelector({ initialLocale = "en", translations }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selected, setSelected] = useState<Locale>(initialLocale);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const save = async () => {
    const res = await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: selected }),
    }).catch(() => null);
    if (res?.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      startTransition(() => router.refresh());
    } else {
      notify.error(t("errors.generic"));
    }
  };

  const saveLabel = translations?.save ?? t("locale.save");
  const savingLabel = translations?.saving ?? t("locale.saving");
  const savedLabel = translations?.languageSaved ?? t("locale.languageSaved");

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
                            ? "border-[var(--cr-copper)] bg-[var(--cr-copper-bg)]"
                            : "border-[var(--cr-rule-dark)] bg-[var(--cr-paper-2)] hover:bg-[var(--cr-paper-3)] hover:border-[var(--cr-ink-4)]"
                          }`}
            >
              <span className="text-[22px] flex-shrink-0 leading-none">{meta.flag}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-medium leading-tight ${active ? "text-[var(--cr-ink)]" : "text-[var(--cr-ink-2)]"}`}>
                  {meta.native}
                </div>
                <div className="text-[11px] text-[var(--cr-ink-4)] mt-0.5">{meta.name}</div>
              </div>
              {meta.rtl && (
                <span className="text-[9px] text-[var(--cr-ink-4)] uppercase tracking-[0.06em] flex-shrink-0">
                  {t("locale.rtl")}
                </span>
              )}
              {active && <Check className="w-4 h-4 text-[var(--cr-copper)] flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={save}
          disabled={isPending}
          className="px-6 py-2.5 bg-[var(--cr-copper)] text-white text-[13px]
                     font-semibold rounded-[4px] btn-copper-shimmer
                     hover:bg-[var(--cr-copper-l)] active:scale-[0.99]
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all duration-150"
        >
          {isPending ? savingLabel : saveLabel}
        </button>
        {saved && (
          <span className="text-[13px] text-[var(--cr-up)] flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            {savedLabel}
          </span>
        )}
      </div>
    </div>
  );
}
