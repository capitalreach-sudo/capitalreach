import { cookies } from "next/headers";
import { LOCALES, DEFAULT_LOCALE } from "./locale";
import type { Locale } from "./locale";

export function getLocale(): Locale {
  try {
    const cookieStore = cookies();
    const raw = cookieStore.get("cr_locale")?.value;
    return (LOCALES as string[]).includes(raw ?? "") ? (raw as Locale) : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMessages(locale: Locale): Promise<Record<string, any>> {
  try {
    const messages = await import(`../messages/${locale}.json`);
    return messages.default;
  } catch {
    const fallback = await import("../messages/en.json");
    return fallback.default;
  }
}

/** @deprecated use getMessages */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadMessages(locale: Locale): Promise<Record<string, any>> {
  return getMessages(locale);
}
