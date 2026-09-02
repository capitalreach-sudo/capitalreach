"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { LOCALES, DEFAULT_LOCALE, isRTL } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

/**
 * Carries the server-resolved locale AND its dictionary into the client tree.
 *
 * Two jobs, and the second is why this file exists in its current form:
 *
 * 1. No flash of the wrong language. useTranslation used to start every client
 *    component at "en" and read the cookie only in an effect -- after
 *    hydration. That rendered English into the SSR HTML regardless of the
 *    cookie, then swapped once JS ran. The layout resolves the locale on the
 *    server and passes it (with its messages) down, so server and client agree
 *    on the first paint.
 *
 * 2. One language on the wire, not fifteen. useTranslation used to statically
 *    import all 15 locale JSONs (~3.2 MB) into a client module that shipped on
 *    every page. Now the server inlines only the ACTIVE locale's dictionary
 *    (via initialMessages), English stays a static fallback inside
 *    useTranslation, and any later language change dynamic-imports just that
 *    one locale's chunk. A visitor downloads their own language, not all of
 *    them.
 *
 * initialMessages is null when the active locale is English: there is nothing
 * to inline because useTranslation already has English statically as its
 * fallback, so English pages pay nothing extra.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dict = Record<string, any>;
type LocaleState = { locale: Locale; messages: Dict | null };

const LocaleContext = createContext<LocaleState | null>(null);

function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
  const raw = m?.[1];
  return raw && (LOCALES as string[]).includes(raw) ? (raw as Locale) : null;
}

/**
 * Client-side dictionary loader. The template-literal import makes webpack emit
 * one lazy chunk per locale, so switching to German fetches German alone. This
 * path only runs when the client locale ends up different from what the server
 * rendered -- a static page corrected from its cookie, or the localechange
 * event -- which on the normal navigation path never happens.
 */
async function loadLocaleMessages(locale: Locale): Promise<Dict> {
  try {
    return (await import(`../../messages/${locale}.json`)).default as Dict;
  } catch {
    return (await import("../../messages/en.json")).default as Dict;
  }
}

export function LocaleProvider({
  initialLocale,
  initialMessages = null,
  children,
}: {
  initialLocale: Locale;
  initialMessages?: Dict | null;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<LocaleState>({ locale: initialLocale, messages: initialMessages });

  // Latest locale without re-arming the effect: the effect subscribes once and
  // reads current through the ref, so a change never tears down the listener.
  const localeRef = useRef(state.locale);
  localeRef.current = state.locale;

  // Static routes (force-static: the six content pages) are rendered at build
  // time, where there is no request and therefore no cookie -- the server seed
  // is always the default locale. Without this correction a German visitor got
  // English on those pages permanently, and the switcher looked broken because
  // navigating served the same prerendered HTML again.
  //
  // Deliberately after hydration, so server and client agree on the first
  // paint. The correct dictionary is fetched before the swap, so the page
  // moves from default-locale straight to the full target language in one step
  // -- never a half-translated frame.
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      const next = readLocaleCookie() ?? initialLocale;
      if (next === localeRef.current) return;
      void loadLocaleMessages(next).then(messages => {
        // Re-read: the cookie may have changed again while the chunk loaded.
        if (cancelled || next !== (readLocaleCookie() ?? initialLocale)) return;
        setState({ locale: next, messages });
        if (typeof document !== "undefined") {
          document.documentElement.lang = next;
          document.documentElement.dir = isRTL(next) ? "rtl" : "ltr";
        }
      });
    };
    sync();
    window.addEventListener("localechange", sync);
    return () => { cancelled = true; window.removeEventListener("localechange", sync); };
  }, [initialLocale]);

  return <LocaleContext.Provider value={state}>{children}</LocaleContext.Provider>;
}

/**
 * The active locale. Falls back to the cookie, then to the default, so a client
 * component rendered outside the provider still behaves rather than throwing.
 */
export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx.locale;
  return readLocaleCookie() ?? DEFAULT_LOCALE;
}

/**
 * The active locale's dictionary, or null when it is English (or when rendered
 * outside the provider). useTranslation treats null as "use the static English
 * fallback", so null is a valid, expected value rather than an error.
 */
export function useLocaleMessages(): Dict | null {
  return useContext(LocaleContext)?.messages ?? null;
}
