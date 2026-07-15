import { cookies } from "next/headers";
import { LOCALES, DEFAULT_LOCALE } from "./locale";
import type { Locale } from "./locale";

export function getLocale(): Locale {
  try {
    // Force a fresh cookie read — calling getAll() prevents Next.js from
    // serving a cached snapshot when the cr_locale cookie has just changed.
    const cookieStore = cookies();
    cookieStore.getAll(); // trigger fresh read
    const raw = cookieStore.get("cr_locale")?.value;
    return LOCALES.includes(raw as Locale) ? (raw as Locale) : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getT(locale: Locale): Promise<Record<string, any>> {
  try {
    return (await import(`../messages/${locale}.json`)).default;
  } catch {
    console.warn(`[i18n] Missing translations for "${locale}", falling back to en`);
    return (await import("../messages/en.json")).default;
  }
}

/** @deprecated use getT */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMessages(locale: Locale): Promise<Record<string, any>> {
  return getT(locale);
}

/** @deprecated use getT */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadMessages(locale: Locale): Promise<Record<string, any>> {
  return getT(locale);
}
