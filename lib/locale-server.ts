import { cookies } from "next/headers";
import { LOCALES, DEFAULT_LOCALE } from "./locale";
import type { Locale } from "./locale";

export function getLocale(): Locale {
  try {
    const cookieStore = cookies();
    const raw = cookieStore.get("cr_locale")?.value;
    if (raw && (LOCALES as string[]).includes(raw)) return raw as Locale;
    return DEFAULT_LOCALE;
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

export type ServerT = (key: string, vars?: Record<string, string | number>) => string;

// Server-component equivalent of hooks/useTranslation.ts's `t` — same dot-path
// lookup, same English fallback, same {placeholder} substitution.
export async function getTranslator(locale: Locale): Promise<ServerT> {
  const messages = await getT(locale);
  const en = locale === "en" ? messages : await getT("en" as Locale);

  return function t(key: string, vars?: Record<string, string | number>): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolve = (src: Record<string, any>): string | undefined => {
      let v: unknown = src;
      for (const part of key.split(".")) {
        if (typeof v !== "object" || v === null) return undefined;
        v = (v as Record<string, unknown>)[part];
      }
      return typeof v === "string" ? v : undefined;
    };
    const value = resolve(messages) ?? resolve(en) ?? key;
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
  };
}
