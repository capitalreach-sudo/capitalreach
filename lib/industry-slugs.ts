import { INDUSTRIES } from "@/types";
import { slugify } from "@/lib/utils";

/**
 * URL slugs for the sector landing pages, derived from the one industry list
 * the whole app already shares — a hand-maintained slug map would drift the
 * first time INDUSTRIES gains an entry.
 *
 * "Other" is excluded: /startups/sector/other is not a landing page anyone
 * searches for, and a page of miscellany dilutes what the sector pages are
 * for (ranking for "fintech startups raising", not for "other").
 */
export const SECTOR_SLUGS: ReadonlyArray<{ slug: string; industry: string }> =
  INDUSTRIES.filter((i) => i !== "Other").map((industry) => ({
    slug: slugify(industry),
    industry,
  }));

export function industryFromSlug(slug: string): string | null {
  return SECTOR_SLUGS.find((s) => s.slug === slug)?.industry ?? null;
}
