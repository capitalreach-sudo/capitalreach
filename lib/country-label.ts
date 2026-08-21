/**
 * Translated display name for a canonical country string (lib/countries.ts).
 *
 * Countries are stored in English ("Germany") because they are FILTER VALUES
 * — an investor whose thesis says "Germany" has to match a startup that says
 * "Germany", in any language. Display is the only place localisation
 * belongs, and this is the one helper that does it. Unknown values (free
 * text from old rows) fall through unchanged rather than rendering a key.
 */
export function countryLabel(t: (key: string) => string, name: string | null | undefined): string {
  if (!name) return "";
  const translated = t(`countries.${name}`);
  return translated === `countries.${name}` ? name : translated;
}
