"use client";

import { useState, useEffect, useCallback } from "react";
import en from "../messages/en.json";
import de from "../messages/de.json";

type Locale = "en" | "de";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MESSAGES: Record<Locale, Record<string, any>> = { en, de };

export function useTranslation() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
    if (match && (match[1] === "en" || match[1] === "de")) {
      setLocale(match[1] as Locale);
    }
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
