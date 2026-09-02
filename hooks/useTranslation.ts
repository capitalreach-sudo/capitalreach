"use client";

import { useCallback } from "react";
// English is the ONLY dictionary bundled statically: it is the fallback for
// every missing key in every locale, so it must always be present. The other
// 14 languages used to be imported here too (~3.2 MB shipped on every page);
// now the active locale's dictionary arrives from the server through
// LocaleProvider, and language switches dynamic-import a single chunk.
import en from "../messages/en.json";
import { useLocale, useLocaleMessages } from "@/components/providers/locale-provider";

export function useTranslation() {
  // Both come from the server via LocaleProvider, so the first render --
  // including the SSR pass -- is already in the right language. This used to
  // start at "en" and correct itself in an effect, which meant every client
  // component shipped English HTML regardless of the cookie and only caught up
  // once hydration ran.
  const locale = useLocale();

  // null when the active locale is English, or when rendered outside the
  // provider -- either way the static English dictionary is the right answer.
  const messages = useLocaleMessages() ?? en;

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
          value = resolvePlural(messages) ?? resolvePlural(en);
        }
      }
      value ??= resolve(messages) ?? resolve(en) ?? key;
      if (!vars) return value;
      return value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
    },
    [messages, locale],
  );

  return { locale, t };
}
