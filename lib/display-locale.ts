/**
 * The locale that DATES and relative times render in.
 *
 * The shared date helpers (lib/format, lib/utils) are called from ~55 sites,
 * most of them client components, and they hardcoded English -- so every
 * localized page carried "Sep 10, 2026" and "3h ago" mid-sentence in
 * Japanese and German prose. Threading a locale parameter through every call
 * site would be the pure fix; this is the pragmatic one: a single module
 * both helpers read.
 *
 * On the CLIENT the truth is <html lang>, which the server stamps per
 * request -- no store needed. On the SERVER, LocaleProvider (which renders
 * above every consumer, in the same pass) sets the module variable from the
 * request's resolved locale before any date renders below it. A concurrent
 * request interleaving a streamed chunk could theoretically read the other
 * request's locale for one date -- cosmetic, and strictly better than
 * permanently English.
 */
let current = "en";

export function setDisplayLocale(locale: string | null | undefined): void {
  if (locale) current = locale;
}

export function displayLocale(): string {
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang;
    if (lang) return lang;
  }
  return current;
}
