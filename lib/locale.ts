export type Locale =
  | "en" // English
  | "de" // German
  | "fr" // French
  | "es" // Spanish
  | "zh" // Chinese (Simplified)
  | "ja" // Japanese
  | "ar" // Arabic
  | "ko" // Korean
  | "pt" // Portuguese
  | "it" // Italian
  | "ru" // Russian
  | "hi" // Hindi
  | "nl" // Dutch
  | "sv" // Swedish
  | "pl" // Polish

export const LOCALES: Locale[] = [
  "en", "de", "fr", "es", "zh", "ja", "ar", "ko", "pt", "it", "ru", "hi", "nl", "sv", "pl",
];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_META: Record<Locale, {
  name: string;
  native: string;
  flag: string;
  rtl: boolean;
  font?: string;
}> = {
  en: { name: "English",              native: "English",    flag: "🇬🇧", rtl: false },
  de: { name: "German",               native: "Deutsch",    flag: "🇩🇪", rtl: false },
  fr: { name: "French",               native: "Français",   flag: "🇫🇷", rtl: false },
  es: { name: "Spanish",              native: "Español",    flag: "🇪🇸", rtl: false },
  zh: { name: "Chinese (Simplified)", native: "中文",        flag: "🇨🇳", rtl: false, font: "Noto Sans SC" },
  ja: { name: "Japanese",             native: "日本語",      flag: "🇯🇵", rtl: false, font: "Noto Sans JP" },
  ar: { name: "Arabic",               native: "العربية",    flag: "🇸🇦", rtl: true,  font: "Noto Sans Arabic" },
  ko: { name: "Korean",               native: "한국어",      flag: "🇰🇷", rtl: false, font: "Noto Sans KR" },
  pt: { name: "Portuguese",           native: "Português",  flag: "🇧🇷", rtl: false },
  it: { name: "Italian",              native: "Italiano",   flag: "🇮🇹", rtl: false },
  ru: { name: "Russian",              native: "Русский",    flag: "🇷🇺", rtl: false, font: "Noto Sans" },
  hi: { name: "Hindi",                native: "हिंदी",       flag: "🇮🇳", rtl: false, font: "Noto Sans Devanagari" },
  nl: { name: "Dutch",                native: "Nederlands", flag: "🇳🇱", rtl: false },
  sv: { name: "Swedish",              native: "Svenska",    flag: "🇸🇪", rtl: false },
  pl: { name: "Polish",               native: "Polski",     flag: "🇵🇱", rtl: false },
};

/** Convenience flat maps kept for any legacy code */
export const LOCALE_NAMES = Object.fromEntries(
  (Object.entries(LOCALE_META) as [Locale, typeof LOCALE_META[Locale]][])
    .map(([k, v]) => [k, v.native])
) as Record<Locale, string>;

export const LOCALE_FLAGS = Object.fromEntries(
  (Object.entries(LOCALE_META) as [Locale, typeof LOCALE_META[Locale]][])
    .map(([k, v]) => [k, v.flag])
) as Record<Locale, string>;

export const LOCALE_RTL: Locale[] = (
  Object.entries(LOCALE_META) as [Locale, typeof LOCALE_META[Locale]][]
)
  .filter(([, v]) => v.rtl)
  .map(([k]) => k);

export function isRTL(locale: Locale): boolean {
  return LOCALE_META[locale]?.rtl ?? false;
}

export function getLocaleFont(locale: Locale): string | undefined {
  return LOCALE_META[locale]?.font;
}

/** Simple {key} interpolation for use in templates */
export function interpolate(
  str: string,
  vars: Record<string, string | number> = {},
): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    str,
  );
}
