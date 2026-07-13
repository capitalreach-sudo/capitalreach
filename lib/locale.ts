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
