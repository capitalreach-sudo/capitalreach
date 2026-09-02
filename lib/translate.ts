import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { LOCALE_META, type Locale } from "@/lib/locale";
import { createAdminClient } from "@/lib/supabase-server";
import { openai, isOpenAIConfigured } from "@/lib/openai";

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

/**
 * Server-side cache read for the render path. Returns a ready translation ONLY
 * when one exists AND its source hash still matches the live content — an
 * edited listing whose prose moved on is a miss, never a stale hit.
 *
 * This is what lets a detail page paint an already-translated listing on the
 * first byte with no model call and no flash: a plain indexed lookup on the
 * (entity_type, entity_id, locale) unique key. A miss just means the client
 * will fetch it — cheaply, once — and warm the cache for the next viewer.
 */
export async function readCachedTranslation(
  entityType: "startup" | "investor" | "update",
  entityId: string,
  locale: Locale,
  currentFields: TranslatedFields,
): Promise<TranslatedFields | null> {
  if (Object.keys(currentFields).length === 0) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("content_translations")
      .select("fields, source_hash")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("locale", locale)
      .maybeSingle();
    if (!data || data.source_hash !== sourceHash(currentFields)) return null;
    return data.fields as TranslatedFields;
  } catch {
    // A cache read must never break a page render; the original prose is there.
    return null;
  }
}

// Runs on whichever model account is funded. OpenAI is the platform's primary
// (the assistant, scoring and due-diligence all bill there — "one funded
// account runs everything"); Anthropic is the fallback. Being Anthropic-only
// is what previously left translation dark whenever only the OpenAI key was
// set, which is the common case in this deployment.
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
export const translationAvailable = isOpenAIConfigured || hasAnthropic;

/** The instruction set is identical across providers — the rules are the product. */
function systemPrompt(language: string): string {
  return [
    `You translate startup fundraising copy into ${language}.`,
    "Return ONLY a JSON object with exactly the same keys you were given. No prose before or after it.",
    "Rules:",
    "- Translate meaning, not word order. Keep the register plain and factual.",
    "- Never translate company names, product names, or people's names.",
    "- Never convert, recalculate or reformat numbers, currencies, percentages or dates. Reproduce them exactly as written.",
    "- Keep industry terms that stay untranslated in the target language (SaaS, ARR, SAFE) as they are.",
    "- If a value is already in the target language, return it unchanged.",
    "- Do not add, remove, summarise or improve anything. This is a legal-adjacent document.",
  ].join("\n");
}

/**
 * Validate a model's raw output down to exactly the keys we asked for, as
 * strings. The brace-slice tolerates a stray code fence without trusting
 * anything outside the object; a model that invents a key or returns an object
 * for a value must not end up rendered on a listing.
 */
function parseTranslation(raw: string, keys: string[]): TranslatedFields | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const out: TranslatedFields = {};
  for (const k of keys) {
    const v = parsed[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

async function viaOpenAI(fields: TranslatedFields, language: string, keys: string[]): Promise<TranslatedFields | null> {
  if (!isOpenAIConfigured) return null;
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,                       // translation is transformation, not invention
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt(language) },
      { role: "user", content: JSON.stringify(fields) },
    ],
  });
  return parseTranslation(res.choices?.[0]?.message?.content ?? "", keys);
}

async function viaAnthropic(fields: TranslatedFields, language: string, keys: string[]): Promise<TranslatedFields | null> {
  if (!hasAnthropic) return null;
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    output_config: { effort: "low" },     // cheap/fast; a cached page pays once
    system: systemPrompt(language),
    messages: [{ role: "user", content: JSON.stringify(fields) }],
  });
  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");
  return parseTranslation(raw, keys);
}

/**
 * Returns the translated fields, or null if translation is unavailable or every
 * provider returned something unusable. Never throws: a failed translation must
 * leave the original readable rather than break the page.
 *
 * The failure reason is recorded rather than swallowed — a rejected key, an
 * unreachable model and an exhausted quota look identical from outside (a bare
 * 502). It goes to system_events, which the admin page already reads.
 */
export async function translateFields(
  fields: TranslatedFields,
  target: Locale,
): Promise<TranslatedFields | null> {
  if (!translationAvailable) return null;
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;

  const language = LOCALE_META[target]?.name ?? target;

  // OpenAI first (funded account), Anthropic as fallback. Each provider's own
  // failure drops through to the next rather than aborting the whole call.
  for (const [name, run] of [["openai", viaOpenAI], ["anthropic", viaAnthropic]] as const) {
    try {
      const out = await run(fields, language, keys);
      if (out) return out;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[translate] ${name} failed:`, message);
      const { logSystemEvent } = await import("@/lib/system-events");
      await logSystemEvent("translate", "error", `Translation call failed (${name})`, { target, message: message.slice(0, 400) }).catch(() => {});
      // fall through to the next provider
    }
  }
  return null;
}
