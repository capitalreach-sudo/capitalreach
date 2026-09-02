import { LOCALES, type Locale } from "@/lib/locale";

/**
 * Which of our 15 languages a piece of user-written content is in.
 *
 * This exists so a listing can be auto-translated for a viewer who does not
 * read the language the founder typed in — but ONLY when it is actually a
 * different language. Without a recorded source language the app assumed every
 * listing was English, so a German pitch shown to an English investor offered
 * no translation at all, and a German pitch shown to a German viewer offered to
 * "translate to German".
 *
 * Deliberately dependency-free. The decision it drives is coarse — translate or
 * not — so a heuristic that is right on real prose beats a 40 KB model of every
 * language on earth. Two stages:
 *
 *  1. Script. CJK, kana, Hangul, Arabic, Cyrillic and Devanagari are decisive
 *     on their own — no Latin-script language shares them.
 *  2. Stopwords. Among the nine Latin-script languages, the function words a
 *     language leans on (der/die/das, le/la/les, il/la/le) are its fingerprint;
 *     the language matching the most of them in the text wins.
 *
 * When nothing scores clearly — a two-word tagline, a URL, a number — it
 * returns the fallback (the author's own UI locale) rather than guessing, and
 * the fallback's own fallback is English.
 */

// Common function words per Latin-script locale. Chosen to be frequent AND, as
// far as possible, distinctive: the overlaps (nl/de "de", es/pt "de") are why
// detection scores by how MANY match rather than whether any single one does.
const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "of", "to", "in", "is", "for", "with", "that", "this", "are", "our", "we", "on", "as", "by", "be", "from", "it", "has", "will", "an", "or", "at"],
  de: ["der", "die", "das", "und", "ist", "ein", "eine", "mit", "für", "den", "dem", "nicht", "auch", "sich", "unser", "von", "zu", "im", "auf", "werden", "wird", "sind", "aber", "durch", "einer"],
  fr: ["le", "la", "les", "et", "des", "une", "est", "pour", "dans", "avec", "que", "qui", "nous", "notre", "sur", "aux", "du", "ce", "cette", "sont", "plus", "par", "pas", "ses", "leur"],
  es: ["el", "los", "las", "y", "de", "un", "una", "es", "para", "con", "que", "en", "nuestro", "nuestra", "por", "su", "del", "como", "más", "pero", "este", "esta", "son", "sus", "lo"],
  it: ["il", "gli", "di", "un", "una", "è", "per", "con", "che", "in", "nostro", "nostra", "del", "della", "come", "più", "ma", "questo", "questa", "sono", "dei", "delle", "gli", "nel", "alla"],
  nl: ["het", "een", "en", "van", "is", "voor", "met", "dat", "die", "wij", "onze", "ons", "op", "te", "zijn", "niet", "ook", "maar", "aan", "door", "worden", "wordt", "deze", "naar", "bij"],
  pt: ["os", "as", "e", "de", "um", "uma", "é", "para", "com", "que", "em", "nosso", "nossa", "por", "sua", "da", "como", "mais", "mas", "este", "esta", "são", "dos", "das", "no"],
  pl: ["i", "w", "na", "z", "do", "jest", "nie", "że", "się", "dla", "oraz", "jako", "przez", "nasz", "nasza", "to", "są", "ale", "lub", "od", "po", "które", "który", "być", "przy"],
  sv: ["och", "att", "det", "som", "en", "ett", "är", "för", "med", "på", "av", "till", "den", "vi", "vår", "inte", "men", "eller", "från", "har", "kan", "ska", "de", "sig", "om"],
};

const LATIN_LOCALES = Object.keys(STOPWORDS) as Locale[];

/** Distinctive characters that break ties between similar Latin-script languages. */
function diacriticBonus(text: string): Partial<Record<Locale, number>> {
  const b: Partial<Record<Locale, number>> = {};
  if (/[ąęłżźśćń]/i.test(text)) b.pl = (b.pl ?? 0) + 3;
  if (/[åäö]/i.test(text) && !/[ßüẞ]/i.test(text)) b.sv = (b.sv ?? 0) + 1;
  if (/[ß]/i.test(text)) b.de = (b.de ?? 0) + 2;
  if (/[ñ¿¡]/i.test(text)) b.es = (b.es ?? 0) + 2;
  if (/[ãõ]/i.test(text)) b.pt = (b.pt ?? 0) + 2;
  if (/[àèìòù]/i.test(text)) b.it = (b.it ?? 0) + 1;
  if (/[œçâîû]/i.test(text)) b.fr = (b.fr ?? 0) + 1;
  return b;
}

function isValidLocale(l: string): l is Locale {
  return (LOCALES as string[]).includes(l);
}

/**
 * Best-guess language of `text`, restricted to our supported locales.
 * `fallback` is returned when the text is too short or ambiguous to call.
 */
export function detectLanguage(text: string | null | undefined, fallback: Locale = "en"): Locale {
  const safeFallback: Locale = isValidLocale(fallback) ? fallback : "en";
  if (!text) return safeFallback;

  // ── 1. Script: decisive on its own ──────────────────────────────────────
  // Count characters per script; a clear plurality of a non-Latin script means
  // the language is settled without touching stopwords.
  const han = (text.match(/[一-鿿]/g) || []).length;
  const kana = (text.match(/[぀-ヿ]/g) || []).length;   // hiragana + katakana
  const hangul = (text.match(/[가-힣]/g) || []).length;
  const arabic = (text.match(/[؀-ۿ]/g) || []).length;
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) || []).length;
  const devanagari = (text.match(/[ऀ-ॿ]/g) || []).length;

  // Threshold guards against a single stray CJK/emoji-adjacent glyph in English.
  const MIN = 2;
  if (kana >= MIN) return "ja";                 // kana is unique to Japanese
  if (hangul >= MIN) return "ko";
  if (arabic >= MIN) return "ar";
  if (devanagari >= MIN) return "hi";
  if (cyrillic >= MIN) return "ru";
  if (han >= MIN) return "zh";                  // Han without kana → Chinese

  // ── 2. Stopwords among the Latin-script languages ───────────────────────
  const tokens = text.toLowerCase().match(/[a-zà-ÿąęłżźśćńœ]+/gi) || [];
  if (tokens.length < 3) return safeFallback;   // too little prose to judge

  const tokenSet = tokens;
  const scores: Partial<Record<Locale, number>> = {};
  for (const loc of LATIN_LOCALES) {
    const words = new Set(STOPWORDS[loc]);
    let hits = 0;
    for (const tok of tokenSet) if (words.has(tok)) hits++;
    scores[loc] = hits;
  }
  const bonus = diacriticBonus(text);
  for (const loc of Object.keys(bonus) as Locale[]) {
    scores[loc] = (scores[loc] ?? 0) + (bonus[loc] ?? 0);
  }

  let best: Locale = safeFallback;
  let bestScore = 0;
  let runnerUp = 0;
  for (const loc of LATIN_LOCALES) {
    const s = scores[loc] ?? 0;
    if (s > bestScore) { runnerUp = bestScore; bestScore = s; best = loc; }
    else if (s > runnerUp) { runnerUp = s; }
  }

  // Need a real signal AND a real margin. A near-tie between, say, es and pt on
  // a short bilingual-ish string is not worth overriding the author's locale.
  const relativeStrength = bestScore / tokens.length;
  if (bestScore >= 2 && bestScore > runnerUp && relativeStrength >= 0.06) {
    return best;
  }
  return safeFallback;
}
