import { LocaleMessagesProvider } from "./locale-context";
import { loadDictionary } from "@/lib/i18n-dictionary";
import type { Locale } from "@/lib/locale";
import type { Dictionary } from "@/lib/i18n-dictionary";

/**
 * Carries the server-resolved locale AND its dictionary into the client tree.
 *
 * Two jobs, and the second is why this file is a server component:
 *
 * 1. No flash of the wrong language. useTranslation used to start every client
 *    component at "en" and read the cookie only in an effect -- after
 *    hydration. That rendered English into the SSR HTML regardless of the
 *    cookie, then swapped once JS ran. The layout resolves the locale on the
 *    server and passes it (with its messages) down, so server and client agree
 *    on the first paint.
 *
 * 2. One language on the wire, and it arrives as data rather than as code.
 *    useTranslation used to statically import all 15 locale JSONs (~3.2 MB)
 *    into a client module that shipped on every page. That became: inline the
 *    ACTIVE locale from the server, and keep English as a static import
 *    because it was the per-key fallback. The static English import was still
 *    247 KB of JSON compiled as JavaScript in the first-load bundle of every
 *    route -- the largest single item on pages like /terms and /privacy, whose
 *    entire body is server-rendered and which need no page dictionary at all.
 *    English is now inlined exactly like the other fourteen, so no locale JSON
 *    is reachable from a client entry.
 *
 *    The per-key English fallback is gone with it. tests/i18n.test.ts asserts
 *    every locale carries every en key, so the fallback could never fire; a
 *    missing translation now fails that test instead of silently shipping an
 *    English string mid-page.
 *
 * initialMessages is what app/layout.tsx already resolved. It is null when the
 * active locale is English -- the layout skipped the load because English used
 * to be free on the client -- so this component loads it. Passing it or not is
 * therefore a caller's optimisation, not a contract.
 *
 * Why the dictionary is inlined rather than fetched as its own JS chunk: Next
 * flushes the whole flight payload after the markup (measured on /terms: the
 * closing </footer> lands before the first __next_f.push), so the bytes arrive
 * behind everything the browser needs to paint, and they are parsed as JSON
 * instead of compiled as a module.
 */
export async function LocaleProvider({
  initialLocale,
  initialMessages = null,
  children,
}: {
  initialLocale: Locale;
  initialMessages?: Dictionary | null;
  children: React.ReactNode;
}) {
  const messages = initialMessages ?? (await loadDictionary(initialLocale));

  return (
    <LocaleMessagesProvider locale={initialLocale} messages={messages}>
      {children}
    </LocaleMessagesProvider>
  );
}

// Re-exported at the old path: six client components import useLocale from
// here, and this file can no longer define it.
export { useLocale, useLocaleMessages } from "./locale-context";
