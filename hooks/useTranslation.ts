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
      // Plural forms. When a `count` is passed, a sibling key suffixed with
      // the CLDR category for that number wins over the base key -- so
      // "startups.pageSubtitle" can have a "_one" alongside it and stop
      // rendering "1 companies currently listed".
      //
      // Intl.PluralRules is used rather than a count === 1 check because the
      // categories are not the same everywhere: Russian and Polish need "few"
      // and "many", Arabic has six. A locale that has not been given the form
      // its number selects falls back to the base key, which is always the
      // general plural -- worse than a tailored string, better than a wrong
      // one, and never a missing one.
      let value: string | undefined;
      if (vars && typeof vars.count === "number") {
        let category: string | undefined;
        try {
          category = new Intl.PluralRules(locale).select(vars.count);
        } catch {
          // Unsupported locale tag: skip plural selection, keep the base key.
        }
        if (category) {
          const pluralKey = `${key}_${category}`;
          const resolvePlural = (src: Record<string, unknown>) => {
            let v: unknown = src;
            for (const part of pluralKey.split(".")) {
              if (typeof v !== "object" || v === null) return undefined;
              v = (v as Record<string, unknown>)[part];
            }
            return typeof v === "string" ? v : undefined;
          };
          value = resolvePlural(messages) ?? resolvePlural(MESSAGES["en"]);
        }
      }
      value ??= resolve(messages) ?? resolve(MESSAGES["en"]) ?? key;
      if (!vars) return value;
      return value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
    },
    [messages],
  );

  return { locale, t };
}
