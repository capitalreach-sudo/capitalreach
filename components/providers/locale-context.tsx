"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { LOCALES, DEFAULT_LOCALE, isRTL } from "@/lib/locale";
import type { Locale } from "@/lib/locale";
import { loadDictionary } from "@/lib/i18n-dictionary";
import type { Dictionary } from "@/lib/i18n-dictionary";

/**
 * The client half of the locale boundary: it holds the dictionary the server
 * handed down and hands it to useTranslation.
 *
 * The server half lives in ./locale-provider and is what the root layout
 * mounts. Splitting the two is not cosmetic -- the dictionary can only reach
 * the client as a prop crossing a server/client boundary, and that boundary has
 * to be a component, so the piece that reads the JSON cannot be the same
 * module as the piece that calls useState.
 */
type LocaleState = { locale: Locale; messages: Dictionary };

const LocaleContext = createContext<LocaleState | null>(null);

function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)cr_locale=([^;]+)/);
  const raw = m?.[1];
  return raw && (LOCALES as string[]).includes(raw) ? (raw as Locale) : null;
}

export function LocaleMessagesProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Dictionary;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<LocaleState>({ locale, messages });

  // Latest locale without re-arming the effect: the effect subscribes once and
  // reads current through the ref, so a change never tears down the listener.
  const localeRef = useRef(state.locale);
  localeRef.current = state.locale;

  // A page rendered without a request -- a build-time prerender -- has no
  // cookie to read, so the server seed is the default locale. Without this
  // correction a German visitor got such a page in English permanently, and
  // the switcher looked broken because navigating served the same prerendered
  // HTML again.
  //
  // Deliberately after hydration, so server and client agree on the first
  // paint. The correct dictionary is fetched before the swap, so the page
  // moves from default-locale straight to the full target language in one step
  // -- never a half-translated frame.
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      const next = readLocaleCookie() ?? locale;
      if (next === localeRef.current) return;
      void loadDictionary(next).then(dict => {
        // Re-read: the cookie may have changed again while the chunk loaded.
        if (cancelled || next !== (readLocaleCookie() ?? locale)) return;
        setState({ locale: next, messages: dict });
        if (typeof document !== "undefined") {
          document.documentElement.lang = next;
          document.documentElement.dir = isRTL(next) ? "rtl" : "ltr";
        }
      });
    };
    sync();
    window.addEventListener("localechange", sync);
    return () => { cancelled = true; window.removeEventListener("localechange", sync); };
  }, [locale]);

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
 * The active locale's dictionary.
 *
 * null means the caller is outside the provider, which is the one state in
 * which t() has nothing to resolve against and would render keys. The root
 * layout wraps the entire tree, so the only way to reach it is to mount a
 * client component outside that wrapper; the dev warning is there because the
 * symptom (every string on screen is a dot-path) is otherwise easy to blame on
 * the translation files.
 */
export function useLocaleMessages(): Dictionary | null {
  const ctx = useContext(LocaleContext);
  if (process.env.NODE_ENV !== "production" && !ctx) {
    console.warn("[i18n] useTranslation used outside LocaleProvider; strings will render as keys.");
  }
  return ctx?.messages ?? null;
}
