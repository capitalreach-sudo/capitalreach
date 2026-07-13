import { cookies } from "next/headers";

export type Locale =
  | "en"  // English
  | "de"  // German
  | "fr"  // French
  | "es"  // Spanish
  | "it"  // Italian
  | "nl"  // Dutch
  | "pt"  // Portuguese
  | "pl"  // Polish
  | "sv"  // Swedish
  | "zh"  // Chinese (Simplified)
  | "ar"  // Arabic
  | "ja"; // Japanese

export const LOCALES: Locale[] = [
  "en", "de", "fr", "es", "it", "nl", "pt", "pl", "sv", "zh", "ar", "ja",
];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  nl: "Nederlands",
  pt: "Português",
  pl: "Polski",
  sv: "Svenska",
  zh: "中文",
  ar: "العربية",
  ja: "日本語",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  en: "🇬🇧",
  de: "🇩🇪",
  fr: "🇫🇷",
  es: "🇪🇸",
  it: "🇮🇹",
  nl: "🇳🇱",
  pt: "🇵🇹",
  pl: "🇵🇱",
  sv: "🇸🇪",
  zh: "🇨🇳",
  ar: "🇸🇦",
  ja: "🇯🇵",
};

export const LOCALE_RTL: Locale[] = ["ar"];

export function isRTL(locale: Locale): boolean {
  return LOCALE_RTL.includes(locale);
}

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

export function t(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: Record<string, any>,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const parts = key.split(".");
  let value: unknown = messages;
  for (const part of parts) {
    if (typeof value !== "object" || value === null) return key;
    value = (value as Record<string, unknown>)[part];
  }
  if (typeof value !== "string") return key;
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
}
