"use client";

import { useEffect } from "react";
import { notify } from "@/components/ui/toast-notify";
import { LOCALE_META } from "@/lib/locale";
import type { Locale } from "@/lib/locale";
import { useTranslation } from "@/hooks/useTranslation";

export function LocaleChangeToast() {
  const { t } = useTranslation();

  useEffect(() => {
    try {
      const locale = sessionStorage.getItem("just_changed_locale") as Locale | null;
      if (!locale) return;
      sessionStorage.removeItem("just_changed_locale");

      const meta = LOCALE_META[locale];
      if (!meta) return;

      notify.success(`${meta.flag} ${t("locale.changedTo", { name: meta.name })}`);
    } catch {
      // sessionStorage unavailable (e.g. SSR context)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
