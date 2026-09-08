import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase-server";

/**
 * How public a startup's DETAIL page is.
 *
 * The browse index is the shopfront: names, sectors, stages, raise and AI
 * score stay open to anyone, because a market nobody can look at is a dead
 * market and those pages are the search traffic. The detail page is a
 * different thing -- problem, solution, market, competitive advantage and use
 * of funds ARE the idea -- and Jack's call is that the idea is not published
 * to anonymous readers.
 *
 *   "open"     -- anyone may read a listing in full
 *   "members"  -- signed-in accounts only (the current setting)
 *
 * Lives in platform_config so it can be flipped without a deploy.
 */
export type ListingDetailMode = "open" | "members";

const CONFIG_KEY = "public_listing_detail";

/**
 * Cached for a minute across requests. The value changes about never, and
 * every listing render and every sitemap build asks for it.
 *
 * The read THROWS rather than defaulting so that a failure is not what gets
 * stored in the cache: a five second database wobble must not pin the whole
 * catalogue into the wrong mode for the next minute. The caller below turns
 * the rejection into a value.
 */
const readMode = unstable_cache(
  async (): Promise<ListingDetailMode> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    if (error) throw error;
    // Missing row = an environment that never configured this, which is the
    // behaviour that existed before the setting did: open.
    return data?.value === "members" ? "members" : "open";
  },
  [`platform-config:${CONFIG_KEY}`],
  { revalidate: 60, tags: ["platform-config"] },
);

export async function listingDetailMode(): Promise<ListingDetailMode> {
  try {
    return await readMode();
  } catch {
    // FAIL OPEN, deliberately. This flag decides whether a public page is
    // public, not whether somebody's money moves: the downside of guessing
    // wrong is that an idea stays readable for a few minutes longer, and the
    // downside of failing closed is that one unreachable config row blacks out
    // the entire catalogue and every listing 302s to a login screen. Anything
    // that actually protects money or documents (financial columns, data room
    // URLs, NDA gates) has its own gate downstream and none of them fail open.
    return "open";
  }
}

/** True when anonymous visitors may read a listing's detail page in full. */
export async function listingDetailPublic(): Promise<boolean> {
  return (await listingDetailMode()) === "open";
}

// ── The catalogue itself ────────────────────────────────────────────────────

const INDEX_KEY = "public_browse_index";

/**
 * Whether the browse index and the sector pages are readable signed out.
 *
 * Separate from the detail flag because they are separate decisions: a
 * marketplace can reasonably show its catalogue and withhold the pitches.
 * With this at "members" the product's public face is the home page, the
 * pricing page and the data centre, and nothing else -- which also means
 * search engines have nothing left to index. That is the owner's call and
 * it is one config row to reverse.
 *
 * Same failure posture as the detail flag: the cached read throws so a
 * wobble is never what gets cached, and the wrapper fails OPEN, because a
 * blank catalogue is a worse outcome than a briefly visible one.
 */
const readIndexMode = unstable_cache(
  async (): Promise<ListingDetailMode> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_config")
      .select("value")
      .eq("key", INDEX_KEY)
      .maybeSingle();
    if (error) throw error;
    return data?.value === "members" ? "members" : "open";
  },
  [`platform-config:${INDEX_KEY}`],
  { revalidate: 60, tags: ["platform-config"] },
);

export async function browseIndexPublic(): Promise<boolean> {
  try {
    return (await readIndexMode()) === "open";
  } catch {
    return true;
  }
}
