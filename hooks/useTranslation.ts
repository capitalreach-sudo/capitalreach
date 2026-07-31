"use client";

import { useCallback } from "react";
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
import type { Locale } from "@/lib/locale";
import { useLocale } from "@/components/providers/locale-provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MESSAGES: Record<Locale, Record<string, any>> = {
  en, de, fr, es, it, nl, pt, pl, sv, zh, ar, ja, ko, ru, hi,
};

export function useTranslation() {
  // Comes from the server via LocaleProvider, so the first render -- including
  // the SSR pass -- is already in the right language. This used to start at
  // "en" and correct itself in an effect, which meant every client component
  // shipped English HTML regardless of the cookie and only caught up once
  // hydration ran.
  const locale = useLocale();

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
