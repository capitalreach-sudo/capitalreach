/**
 * One canonical spelling per country, and a normaliser that gets there from
 * whatever a founder actually typed.
 *
 * `startups.country` is a free-text input with no controlled vocabulary, so
 * the same country arrives as "Germany", "germany", "Deutschland" or "DE".
 * Two consequences, both silent:
 *
 *  1. The Region facet on the browse page lists each spelling as its own
 *     region, so filtering by one hides listings in the others. This is
 *     visible in production today: "Deutschland (1)" and "germany (1)" are
 *     the same country.
 *  2. Worse, computeMatchScore tests `investor.geography.includes(country)`
 *     as an exact string match. An investor whose thesis says "Germany" has
 *     never matched a listing that says "germany", so the geography component
 *     of every such score has been quietly missing its 15 points.
 *
 * Normalising at comparison time fixes both for the rows already in the
 * database, with no migration and no rewriting of anyone's data.
 */

/** Canonical names, offered by the onboarding and editor inputs. */
export const COUNTRIES = [
  "Germany", "Austria", "Switzerland", "France", "Netherlands", "Belgium",
  "Spain", "Portugal", "Italy", "Ireland", "United Kingdom", "Denmark",
  "Sweden", "Norway", "Finland", "Iceland", "Poland", "Czechia", "Slovakia",
  "Hungary", "Romania", "Bulgaria", "Greece", "Croatia", "Slovenia",
  "Estonia", "Latvia", "Lithuania", "Luxembourg", "Malta", "Cyprus",
  "United States", "Canada", "Mexico", "Brazil", "Argentina", "Chile",
  "Colombia", "Israel", "United Arab Emirates", "Saudi Arabia", "Turkey",
  "India", "Singapore", "Japan", "South Korea", "China", "Hong Kong",
  "Australia", "New Zealand", "South Africa", "Nigeria", "Kenya", "Egypt",
] as const;

/**
 * Everything seen in the wild that means one of the above: localised names,
 * ISO codes, and common informal forms. Keys are compared lowercased, so
 * casing variants need no entry of their own.
 */
const ALIASES: Record<string, string> = {
  // German-language names -- the app is bilingual, so these are expected.
  deutschland: "Germany", österreich: "Austria", oesterreich: "Austria",
  schweiz: "Switzerland", frankreich: "France", niederlande: "Netherlands",
  belgien: "Belgium", spanien: "Spain", italien: "Italy", irland: "Ireland",
  dänemark: "Denmark", daenemark: "Denmark", schweden: "Sweden",
  norwegen: "Norway", finnland: "Finland", polen: "Poland",
  griechenland: "Greece", türkei: "Turkey", tuerkei: "Turkey",
  "vereinigtes königreich": "United Kingdom", "großbritannien": "United Kingdom",
  "grossbritannien": "United Kingdom",
  "vereinigte staaten": "United States", indien: "India", japan: "Japan",
  südkorea: "South Korea", suedkorea: "South Korea", china: "China",
  singapur: "Singapore", australien: "Australia", neuseeland: "New Zealand",
  südafrika: "South Africa", suedafrika: "South Africa", ägypten: "Egypt",
  aegypten: "Egypt", brasilien: "Brazil", argentinien: "Argentina",
  kanada: "Canada", mexiko: "Mexico", tschechien: "Czechia",
  ungarn: "Hungary", rumänien: "Romania", bulgarien: "Bulgaria",
  kroatien: "Croatia", slowenien: "Slovenia", estland: "Estonia",
  lettland: "Latvia", litauen: "Lithuania", luxemburg: "Luxembourg",
  zypern: "Cyprus", israel: "Israel",

  // ISO 3166-1 alpha-2, which people type into a free-text box.
  de: "Germany", at: "Austria", ch: "Switzerland", fr: "France",
  nl: "Netherlands", be: "Belgium", es: "Spain", pt: "Portugal",
  it: "Italy", ie: "Ireland", gb: "United Kingdom", uk: "United Kingdom",
  dk: "Denmark", se: "Sweden", no: "Norway", fi: "Finland",
  pl: "Poland", cz: "Czechia", us: "United States", usa: "United States",
  ca: "Canada", il: "Israel", ae: "United Arab Emirates",
  in: "India", sg: "Singapore", jp: "Japan", kr: "South Korea",
  cn: "China", hk: "Hong Kong", au: "Australia", nz: "New Zealand",
  za: "South Africa",

  // Informal English forms.
  america: "United States", "the us": "United States",
  "u.s.": "United States", "u.s.a.": "United States",
  england: "United Kingdom", scotland: "United Kingdom",
  wales: "United Kingdom", britain: "United Kingdom",
  "great britain": "United Kingdom", holland: "Netherlands",
  uae: "United Arab Emirates", korea: "South Korea",
};

/** Canonical index, so an exact-but-differently-cased name resolves for free. */
const CANONICAL = new Map(COUNTRIES.map((c) => [c.toLowerCase(), c as string]));

/**
 * The canonical name for whatever was typed, or the trimmed input unchanged
 * when it is not recognised.
 *
 * Deliberately never returns null or drops the value: a founder in a country
 * this list has not heard of must still appear in the facet under their own
 * spelling, rather than vanishing from the directory.
 */
export function normalizeCountry(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const key = trimmed.toLowerCase();
  return CANONICAL.get(key) ?? ALIASES[key] ?? trimmed;
}

/** True when two free-text country values mean the same place. */
export function sameCountry(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCountry(a);
  const nb = normalizeCountry(b);
  return na !== "" && na.toLowerCase() === nb.toLowerCase();
}
