/**
 * The investor directory's shared, pure rules -- stage-spelling normalization
 * and the completeness bar a profile must clear before it is treated as a
 * real, browsable listing.
 *
 * Split out of lib/browse-data.ts (which the server loader lives in) because
 * browse-data.ts imports supabase-server and is therefore server-only; a
 * "use client" component (components/investors/investors-client.tsx) and a
 * server component (app/investors/[slug]/page.tsx) both need these same
 * definitions and neither may import a server-only module. This file has no
 * side effects and no imports of its own, so anything can pull from it.
 *
 * Every place that renders or filters on an investor's stored `stages` column
 * MUST go through normaliseInvestorStages rather than reading the column raw:
 * the directory loader, the client top-up fetch, the profile page's mandate
 * strip, and the profile page's "similar investors" query all used to carry
 * their own copy (or no copy at all) of this same logic, and their copies
 * drifted -- a raw "pre_seed" (underscore) sorted last instead of first and
 * rendered as "pre seed" instead of "Pre-Seed" on the profile page, while the
 * directory loader's own copy handled it correctly. One definition now.
 */

// STAGE_LABELS (lib/utils.ts), the directory's stage filter and fit matching
// all key on these four canonical, hyphen/underscore-exact spellings. Every
// stored spelling (typed by hand across onboarding, settings, CSV import,
// demo seed data) maps onto one of them; anything unrecognised is dropped
// rather than rendered raw.
export const INVESTOR_STAGE_ALIASES: Record<string, string> = {
  "pre-seed": "pre-seed",
  pre_seed: "pre-seed",
  preseed: "pre-seed",
  seed: "seed",
  series_a: "series_a",
  "series-a": "series_a",
  series_b_plus: "series_b_plus",
  series_b: "series_b_plus",
  "series-b": "series_b_plus",
  series_c: "series_b_plus",
  growth: "series_b_plus",
};
export const INVESTOR_STAGE_ORDER = ["pre-seed", "seed", "series_a", "series_b_plus"];

/** Raw, possibly-inconsistently-spelled stages -> canonical, ladder-ordered,
 *  deduplicated stages. Unrecognised spellings are dropped, never passed
 *  through -- a raw enum must never reach a label lookup or a sort key. */
export function normaliseInvestorStages(stages: ReadonlyArray<unknown> | null | undefined): string[] {
  const found = new Set<string>();
  for (const raw of stages ?? []) {
    const key = String(raw).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(INVESTOR_STAGE_ALIASES, key)) found.add(INVESTOR_STAGE_ALIASES[key]);
  }
  return INVESTOR_STAGE_ORDER.filter((stage) => found.has(stage));
}

/**
 * The inverse direction: every raw spelling (including the canonical one
 * itself) that normalises onto one of the given canonical stages. Used when
 * matching this investor's canonical stages against OTHER rows' raw, possibly
 * differently-spelled `stages` columns in a Postgres array-overlap filter --
 * normalising only our own side and then comparing literal strings against an
 * un-normalised column would silently miss every row stored under a
 * different (but equivalent) spelling.
 */
export function stageAliasVariants(canonicalStages: ReadonlyArray<string>): string[] {
  const wanted = new Set(canonicalStages);
  const variants = new Set<string>();
  for (const [alias, canonical] of Object.entries(INVESTOR_STAGE_ALIASES)) {
    if (wanted.has(canonical)) variants.add(alias);
  }
  return Array.from(variants);
}

// The directory completeness bar. A profile below it never reaches the
// directory: a bio of at least DIRECTORY_MIN_BIO characters, a plausible
// check size, and at least one recognised stage. The server loader
// (lib/browse-data.ts) and the client top-up fetch
// (components/investors/investors-client.tsx) both apply this same bar --
// see the comment at loadPublicInvestors for why they must agree.
export const DIRECTORY_MIN_BIO = 40;
// Above this a stored check size is a typo, not a mandate.
export const DIRECTORY_MAX_CHECK = 10_000_000_000;

export function plausibleCheck(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= DIRECTORY_MAX_CHECK ? n : null;
}

/** True when a row's own fields clear the directory completeness bar. Bio is
 *  passed pre-trimmed so a caller that already trimmed it (to store the
 *  trimmed value) does not trim twice. */
export function meetsDirectoryBar(row: {
  bio: string | null | undefined;
  min_check: number | null | undefined;
  max_check: number | null | undefined;
  stages: string[];
}): boolean {
  const bio = (row.bio ?? "").trim();
  const min = plausibleCheck(row.min_check);
  const max = plausibleCheck(row.max_check);
  return bio.length >= DIRECTORY_MIN_BIO && (min !== null || max !== null) && row.stages.length > 0;
}
