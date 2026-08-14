import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..", "messages");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));

function flat(d: Record<string, unknown>, p = ""): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    const kk = p ? `${p}.${k}` : k;
    if (v && typeof v === "object") Object.assign(o, flat(v as Record<string, unknown>, kk));
    else o[kk] = String(v);
  }
  return o;
}
const fe = flat(en);
const vars = (s: string) => new Set(Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]));

describe("locale files", () => {
  for (const f of files) {
    const locale = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const fl = flat(locale);

    it(`${f}: every key exists in en.json (no orphan keys)`, () => {
      // A key present in a locale but absent from en is dead weight or a typo
      // -- the app resolves against en's key set.
      const orphans = Object.keys(fl).filter((k) => !(k in fe));
      expect(orphans).toEqual([]);
    });

    it(`${f}: placeholders match en exactly`, () => {
      // A translation that drops {n} renders the literal braces or loses the
      // value; one that invents a var renders "{typo}". Both are user-visible.
      const bad = Object.keys(fl).filter((k) => {
        if (!(k in fe)) return false;
        const a = vars(fe[k]), b = vars(fl[k]);
        return a.size !== b.size || Array.from(a).some((v) => !b.has(v));
      });
      expect(bad).toEqual([]);
    });
  }

  // Was de-only while the other locales were partial. As of 2026-08-06 every
  // locale is at 100%, so completeness is now enforced for all of them — a new
  // en key without its fourteen translations fails the build rather than
  // silently falling back to English mid-page, which is the exact "the
  // translations are broken" report that started this work.
  for (const f of files) {
    it(`${f} is complete (no English fallbacks)`, () => {
      const l = flat(JSON.parse(readFileSync(join(dir, f), "utf8")));
      const missing = Object.keys(fe).filter((k) => !(k in l));
      expect(missing).toEqual([]);
    });
  }

  it("no locale contains characters from a script it has no business using", () => {
    // Twice during translation a character from the wrong script slipped in
    // by hand (Korean 데 inside Japanese, English "very" in a Japanese
    // sentence). Plural-form keys (_one etc.) are exempt per-locale only in
    // that they may not exist; content-wise they are checked the same.
    const forbid: Record<string, Array<[number, number, string]>> = {
      "ja.json": [[0xac00, 0xd7af, "Hangul"]],
      "ko.json": [[0x3040, 0x30ff, "Kana"]],
      "zh.json": [[0xac00, 0xd7af, "Hangul"], [0x3040, 0x30ff, "Kana"]],
      "ru.json": [[0xac00, 0xd7af, "Hangul"], [0x3040, 0x30ff, "Kana"], [0x0600, 0x06ff, "Arabic"]],
      "ar.json": [[0x0400, 0x04ff, "Cyrillic"], [0x3040, 0x30ff, "Kana"]],
      "hi.json": [[0x0600, 0x06ff, "Arabic"], [0x3040, 0x30ff, "Kana"]],
    };
    const offenders: string[] = [];
    for (const [file, ranges] of Object.entries(forbid)) {
      const l = flat(JSON.parse(readFileSync(join(dir, file), "utf8")));
      for (const [k, v] of Object.entries(l)) {
        if (v === fe[k]) continue; // untranslated string, caught above
        for (const ch of v) {
          const c = ch.codePointAt(0)!;
          const hit = ranges.find(([lo, hi]) => c >= lo && c <= hi);
          if (hit) { offenders.push(`${file} ${k}: ${hit[2]} '${ch}'`); break; }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
