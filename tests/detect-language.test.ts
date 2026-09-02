import { describe, it, expect } from "vitest";
import { detectLanguage } from "../lib/detect-language";

// Realistic one-to-two-sentence pitch copy in each supported language — the
// shape of text this actually runs on (a listing's prose), not single words.
const SAMPLES: Record<string, string> = {
  en: "We help small businesses manage their inventory and grow revenue with a simple platform.",
  de: "Wir helfen kleinen Unternehmen, ihr Inventar zu verwalten und den Umsatz mit einer einfachen Plattform zu steigern.",
  fr: "Nous aidons les petites entreprises à gérer leur inventaire et à augmenter leurs revenus avec une plateforme simple.",
  es: "Ayudamos a las pequeñas empresas a gestionar su inventario y a aumentar sus ingresos con una plataforma sencilla.",
  it: "Aiutiamo le piccole imprese a gestire il loro inventario e ad aumentare i ricavi con una piattaforma semplice.",
  nl: "Wij helpen kleine bedrijven om hun voorraad te beheren en de omzet te verhogen met een eenvoudig platform.",
  pt: "Ajudamos as pequenas empresas a gerir o seu inventário e a aumentar as receitas com uma plataforma simples e intuitiva.",
  pl: "Pomagamy małym firmom zarządzać zapasami i zwiększać przychody dzięki prostej platformie internetowej.",
  sv: "Vi hjälper små företag att hantera sitt lager och öka intäkterna med en enkel plattform.",
  zh: "我们帮助小型企业管理库存，并通过简单的平台增加收入。",
  ja: "私たちは中小企業が在庫を管理し、シンプルなプラットフォームで収益を伸ばすお手伝いをします。",
  ko: "우리는 중소기업이 재고를 관리하고 간단한 플랫폼으로 수익을 늘리도록 돕습니다.",
  ar: "نساعد الشركات الصغيرة على إدارة مخزونها وزيادة إيراداتها من خلال منصة بسيطة.",
  ru: "Мы помогаем малому бизнесу управлять запасами и увеличивать доход с помощью простой платформы.",
  hi: "हम छोटे व्यवसायों को उनकी इन्वेंट्री प्रबंधित करने और एक सरल मंच के साथ राजस्व बढ़ाने में मदद करते हैं।",
};

describe("detectLanguage", () => {
  for (const [locale, text] of Object.entries(SAMPLES)) {
    it(`identifies ${locale}`, () => {
      // fallback is deliberately a DIFFERENT language, so a pass proves the
      // detector actually recognised the text rather than returning the default.
      const fallback = locale === "zh" ? "en" : "zh";
      expect(detectLanguage(text, fallback)).toBe(locale);
    });
  }

  it("distinguishes German from English (the case the feature exists for)", () => {
    // A German pitch with an English fallback must NOT come back English —
    // that misfire is exactly why foreign listings offered no translation.
    expect(detectLanguage(SAMPLES.de, "en")).toBe("de");
    expect(detectLanguage(SAMPLES.en, "de")).toBe("en");
  });

  it("does not confuse the Romance languages", () => {
    expect(detectLanguage(SAMPLES.es, "en")).toBe("es");
    expect(detectLanguage(SAMPLES.pt, "en")).toBe("pt");
    expect(detectLanguage(SAMPLES.it, "en")).toBe("it");
    expect(detectLanguage(SAMPLES.fr, "en")).toBe("fr");
  });

  it("falls back when there is not enough prose to judge", () => {
    expect(detectLanguage("Acme", "de")).toBe("de");         // one token
    expect(detectLanguage("Acme Corp", "fr")).toBe("fr");    // two tokens
    expect(detectLanguage("", "es")).toBe("es");             // empty
    expect(detectLanguage(null, "it")).toBe("it");           // null
    expect(detectLanguage(undefined)).toBe("en");            // default of default
    expect(detectLanguage("2024 $5M 30% +12", "en")).toBe("en"); // no words at all
  });

  it("ignores a stray non-Latin glyph in otherwise English text", () => {
    // A single CJK character (a product name, an emoji-adjacent glyph) must not
    // flip an English pitch to Chinese — the script test needs a real plurality.
    expect(detectLanguage("Our platform 平 serves global teams and enterprise clients well.", "en")).toBe("en");
  });

  it("rejects an invalid fallback down to English", () => {
    // @ts-expect-error deliberately passing a non-locale
    expect(detectLanguage("xy", "klingon")).toBe("en");
  });
});
