import { cookies } from "next/headers";

export type Locale = "en" | "de";
export const DEFAULT_LOCALE: Locale = "en";
export const SUPPORTED_LOCALES: Locale[] = ["en", "de"];

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value as Locale;
  return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

export async function loadMessages(locale: Locale) {
  const mod = await import(`../messages/${locale}.json`);
  return mod.default as Messages;
}

export type Messages = {
  nav: {
    startups: string; investors: string; aiTools: string;
    pricing: string; data: string; signIn: string; listStartup: string;
  };
  hero: {
    eyebrow: string; headline: string; sub: string;
    ctaPrimary: string; ctaSecondary: string;
  };
  startups: {
    pageTitle: string; pageSubtitle: string; noListings: string;
    loadMore: string; allLoaded: string; raising: string;
    aiScore: string; runway: string;
  };
  filters: {
    industry: string; stage: string; country: string;
    clearAll: string; apply: string; reset: string;
  };
  common: {
    viewDeal: string; saveWatchlist: string; saved: string;
    requestIntro: string; back: string; continue: string;
    loading: string; noResults: string;
  };
};
