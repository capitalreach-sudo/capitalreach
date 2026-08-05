"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { LOCALES, DEFAULT_LOCALE, isRTL } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

/**
 * Carries the server-resolved locale into the client tree.
 *
 * useTranslation used to start every client component at "en" and only read the
 * cookie in an effect -- after hydration. That meant all 34 components using it
 * rendered English into the SSR HTML no matter what locale was set, then
 * swapped once JS ran. On a slow connection that is a visible flash of the
 * wrong language; if hydration is delayed or fails, the page simply stays in
 * English, which is indistinguishable from the language switcher being broken.
 *
 * The layout already resolves the locale from the cookie on the server. Passing
 * it down means server and client agree on the first render, so there is no
 * flash and no hydration mismatch.
 */
const LocaleContext = createContext<Locale | null>(null);

function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
  const raw = m?.[1];
  return raw && (LOCALES as string[]).includes(raw) ? (raw as Locale) : null;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  // Static routes (force-static: the homepage and the five content pages) are
  // rendered at build time, where there is no request and therefore no cookie
  // -- the server seed is always the default locale. Without this mount sync a
  // German visitor got English on those pages permanently, and the switcher
  // looked broken because navigating served the same prerendered HTML again.
  //
  // Deliberately after hydration, so server and client still agree on the
  // first paint; the correction costs one frame on static pages only, and a
  // frame of English beats a page that never speaks your language.
  useEffect(() => {
    const sync = () => {
      const next = readLocaleCookie() ?? initialLocale;
      setLocale(next);
      // The layout stamped lang/dir from the build-time locale for the same
      // reason; keep the document honest for screen readers and RTL.
      if (typeof document !== "undefined") {
        document.documentElement.lang = next;
        document.documentElement.dir = isRTL(next) ? "rtl" : "ltr";
      }
    };
    sync();
    window.addEventListener("localechange", sync);
    return () => window.removeEventListener("localechange", sync);
  }, [initialLocale]);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/**
 * The active locale. Falls back to the cookie, then to the default, so a client
 * component rendered outside the provider still behaves rather than throwing.
 */
export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  return readLocaleCookie() ?? DEFAULT_LOCALE;
}
