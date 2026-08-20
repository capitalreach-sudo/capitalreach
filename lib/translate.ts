import { createHash } from "node:crypto";
import { openai, isOpenAIConfigured } from "@/lib/openai";
import { LOCALE_META, type Locale } from "@/lib/locale";

/**
 * Machine translation of user-written content.
 *
 * The interface speaks fifteen languages; a listing speaks whichever one the
 * founder typed it in. Localising the chrome around an unreadable pitch is the
 * half of the job that does not decide anything.
 *
 * Three rules, all of them load-bearing:
 *
 *  1. Names are not translated. A company is called what it is called, and a
 *     "translated" company name is a different company as far as a search or a
 *     cap table is concerned.
 *  2. Numbers, currencies and units pass through untouched. This is financial
 *     copy; a model that helpfully converts EUR 2M into "about $2.2M" has
 *     invented a figure nobody said.
 *  3. The result is always LABELLED as machine translation, with the original
 *     one click away. Presenting a model's rendering of a founder's pitch as
 *     the founder's own words is a misrepresentation, and in this context it is
 *     a misrepresentation about an investment.
 */

/** Fields worth translating, per entity. Names and URLs are deliberately absent. */
export const TRANSLATABLE: Record<"startup" | "investor" | "update", string[]> = {
  startup: ["tagline", "problem", "solution", "market", "competitive_advantage", "use_of_funds"],
  investor: ["bio", "investment_thesis"],
  update: ["title", "body"],
};

export type TranslatedFields = Record<string, string>;

/**
 * Identity of the source text. A translation is only served when this matches,
 * so editing a listing retires its own translations instead of leaving a stale
 * pitch — with the old numbers in it — in front of investors.
 */
export function sourceHash(fields: TranslatedFields): string {
  const canonical = Object.keys(fields).sort().map(k => `${k} ${fields[k] ?? ""}`).join("");
  return createHash("sha256").update(canonical).digest("hex");
}

/** Only non-empty strings are worth sending, and one-character ones are not prose. */
export function collectFields(row: Record<string, unknown>, keys: string[]): TranslatedFields {
  const out: TranslatedFields = {};
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim().length > 1) out[k] = v;
  }
  return out;
}

export const translationAvailable = isOpenAIConfigured;

/**
 * Returns the translated fields, or null if translation is unavailable or the
 * model returned something unusable. Never throws: a failed translation must
 * leave the original readable rather than break the page.
 */
export async function translateFields(
  fields: TranslatedFields,
  target: Locale,
): Promise<TranslatedFields | null> {
  if (!isOpenAIConfigured) return null;
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;

  const language = LOCALE_META[target]?.name ?? target;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            `You translate startup fundraising copy into ${language}.`,
            "Return ONLY a JSON object with exactly the same keys you were given.",
            "Rules:",
            "- Translate meaning, not word order. Keep the register plain and factual.",
            "- Never translate company names, product names, or people's names.",
            "- Never convert, recalculate or reformat numbers, currencies, percentages or dates. Reproduce them exactly as written.",
            "- Keep industry terms that stay untranslated in the target language (SaaS, ARR, SAFE) as they are.",
            "- If a value is already in the target language, return it unchanged.",
            "- Do not add, remove, summarise or improve anything. This is a legal-adjacent document.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(fields) },
      ],
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Only keys we asked for, only strings. A model that invents a key or
    // returns an object must not end up rendered on a listing.
    const out: TranslatedFields = {};
    for (const k of keys) {
      const v = parsed[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return Object.keys(out).length ? out : null;
  } catch (err) {
    console.error("[translate] failed:", err);
    return null;
  }
}
