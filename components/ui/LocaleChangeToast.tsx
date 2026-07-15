"use client";

import { useEffect } from "react";
import { notify } from "@/components/ui/toast-notify";
import { LOCALE_META } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

export function LocaleChangeToast() {
  useEffect(() => {
    try {
      const locale = sessionStorage.getItem("just_changed_locale") as Locale | null;
      if (!locale) return;
      sessionStorage.removeItem("just_changed_locale");

      const meta = LOCALE_META[locale];
      if (!meta) return;

      notify.success(`${meta.flag} Language changed to ${meta.name}`);
    } catch {
      // sessionStorage unavailable (e.g. SSR context)
    }
  }, []);

  return null;
}
