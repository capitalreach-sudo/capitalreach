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
import ko from "../messages/ko.json";
import ru from "../messages/ru.json";
import hi from "../messages/hi.json";
import { LOCALES } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MESSAGES: Record<Locale, Record<string, any>> = {
  en, de, fr, es, it, nl, pt, pl, sv, zh, ar, ja, ko, ru, hi,
};

function readLocaleCookie(): Locale {
  const m = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
  const raw = m?.[1] as Locale | undefined;
  return raw && (LOCALES as string[]).includes(raw) ? raw : "en";
}

export function useTranslation() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    setLocale(readLocaleCookie());
    const handler = () => setLocale(readLocaleCookie());
    window.addEventListener("localechange", handler);
    return () => window.removeEventListener("localechange", handler);
  }, []);

  const messages = MESSAGES[locale];

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const resolve = (src: Record<string, unknown>) => {
        let v: unknown = src;
        for (const part of key.split(".")) {
          if (typeof v !== "object" || v === null) return undefined;
          v = (v as Record<string, unknown>)[part];
        }
        return typeof v === "string" ? v : undefined;
      };
      const value = resolve(messages) ?? resolve(MESSAGES["en"]) ?? key;
      if (!vars) return value;
      return value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
    },
    [messages],
  );

  return { locale, t };
}
