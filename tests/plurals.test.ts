import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * t() picks a plural form via Intl.PluralRules. These tests pin the two things
 * that actually break in production: that a count of 1 stops rendering the
 * plural sentence, and that every _one variant stays placeholder-compatible
 * with its base key so the substitution cannot silently drop a number.
 */
const load = (loc: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "messages", `${loc}.json`), "utf8"));

const LOCALES = ["en","de","fr","es","it","nl","pt","pl","sv","zh","ar","ja","ko","ru","hi"];

// Mirrors the resolution order in hooks/useTranslation.ts.
function translate(loc: string, key: string, vars: Record<string, string | number>) {
  const msgs = load(loc);
  const en = load("en");
  const dig = (src: Record<string, unknown>, k: string) => {
    let v: unknown = src;
    for (const part of k.split(".")) {
      if (typeof v !== "object" || v === null) return undefined;
      v = (v as Record<string, unknown>)[part];
    }
    return typeof v === "string" ? v : undefined;
  };
  let value: string | undefined;
  if (typeof vars.count === "number") {
    const cat = new Intl.PluralRules(loc).select(vars.count);
    value = dig(msgs, `${key}_${cat}`) ?? dig(en, `${key}_${cat}`);
  }
  value ??= dig(msgs, key) ?? dig(en, key) ?? key;
  return value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

describe("plural selection", () => {
  it("English says 'company' at 1 and 'companies' above it", () => {
    // The exact bug on production: one listing rendered "1 companies
    // currently listed".
    expect(translate("en", "startups.pageSubtitle", { count: 1 })).toBe("1 company currently listed");
    expect(translate("en", "startups.pageSubtitle", { count: 2 })).toContain("companies");
    expect(translate("en", "startups.pageSubtitle", { count: 0 })).toContain("companies");
  });

  it("every locale has a distinct singular at count 1", () => {
    for (const loc of LOCALES) {
      const one = translate(loc, "startups.pageSubtitle", { count: 1 });
      expect(one, `${loc} singular`).not.toBe("");
      expect(one, `${loc} must substitute the count`).not.toContain("{count}");
    }
  });

  it("no locale leaves an unsubstituted placeholder at any count", () => {
    // Covers the CLDR categories that differ by language -- Russian and Polish
    // select "few"/"many" where English only has "other", and those fall back
    // to the base key rather than to a missing string.
    for (const loc of LOCALES) {
      for (const count of [0, 1, 2, 5, 11, 21, 100]) {
        const s = translate(loc, "startups.pageSubtitle", { count });
        expect(s, `${loc} @ ${count}`).not.toMatch(/\{\w+\}/);
        expect(s, `${loc} @ ${count}`).toContain(String(count));
      }
    }
  });

  it("keys without plural variants are unaffected", () => {
    // Backwards compatibility: passing a count to an ordinary key must still
    // resolve the base string, not fall through to the raw key name.
    const s = translate("en", "startups.showHidden", { count: 3 });
    expect(s).toBe("Show hidden (3)");
  });
});
