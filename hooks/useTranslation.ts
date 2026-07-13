"use client";

import { useState, useEffect, useCallback } from "react";
import en from "../messages/en.json";
import de from "../messages/de.json";
import fr from "../messages/fr.json";
import es from "../messages/es.json";
import it from "../messages/it.json";
import nl from "../messages/nl.json";
import pt from "../messages/pt.json";
import pl from "../messages/pl.json";
import sv from "../messages/sv.json";
import zh from "../messages/zh.json";
import ar from "../messages/ar.json";
import ja from "../messages/ja.json";
import { LOCALES } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MESSAGES: Record<Locale, Record<string, any>> = {
  en, de, fr, es, it, nl, pt, pl, sv, zh, ar, ja,
};

export function useTranslation() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
    const raw = m?.[1] as Locale | undefined;
    if (raw && (LOCALES as string[]).includes(raw)) setLocale(raw);
  }, []);

  const messages = MESSAGES[locale];

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const parts = key.split(".");
      let value: unknown = messages;
      for (const part of parts) {
        if (typeof value !== "object" || value === null) return key;
        value = (value as Record<string, unknown>)[part];
      }
      if (typeof value !== "string") return key;
      if (!vars) return value;
      return value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
    },
    [messages],
  );

  return { locale, t };
}
