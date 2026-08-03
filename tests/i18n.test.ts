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
const vars = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

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
        return a.size !== b.size || [...a].some((v) => !b.has(v));
      });
      expect(bad).toEqual([]);
    });
  }

  it("de.json is complete (no English fallbacks for the German UI)", () => {
    const de = flat(JSON.parse(readFileSync(join(dir, "de.json"), "utf8")));
    const missing = Object.keys(fe).filter((k) => !(k in de));
    expect(missing).toEqual([]);
  });
});
