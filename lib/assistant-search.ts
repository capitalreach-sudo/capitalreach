import { createAdminClient } from "@/lib/supabase-server";
import { safeFormatCurrency } from "@/lib/format";

/**
 * The one tool the assistant gets: find live rounds.
 *
 * "Show me pre-seed fintech in Germany raising under half a million" is one
 * sentence and six filter clicks. The filters already exist and already work —
 * what was missing was a way to describe what you want instead of assembling
 * it.
 *
 * Deliberately narrow. It searches the SAME public projection the browse page
 * serves: active listings only, no financials, no owner, no deal data. The
 * model cannot reach anything through this tool that an anonymous visitor
 * could not reach through the directory, so widening the assistant's reach did
 * not widen what it can leak.
 */

export const FIND_ROUNDS_TOOL = {
  name: "find_rounds",
  description:
    "Search live fundraising rounds on CapitalReach by industry, stage, country, " +
    "raise size or free text. Use it whenever the person asks which companies " +
    "match some description, or asks for examples. Returns at most 12 rounds.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Free text matched against company name and one-line pitch." },
      industry: { type: "string", description: "Exact industry label, e.g. 'FinTech', 'B2B SaaS'." },
      stage: { type: "string", description: "One of: pre_seed, seed, series_a, series_b, series_c, growth." },
      country: { type: "string", description: "Country name as it appears on listings." },
      maxRaise: { type: "number", description: "Only rounds seeking at most this amount, in whole currency units." },
      minRaise: { type: "number", description: "Only rounds seeking at least this amount." },
    },
    additionalProperties: false,
    required: [],
  },
  strict: true as const,
};

export interface FindRoundsInput {
  query?: string;
  industry?: string;
  stage?: string;
  country?: string;
  maxRaise?: number;
  minRaise?: number;
}

/** PostgREST `or` is a mini-language; a stray comma changes its meaning. */
const clean = (v: unknown): string =>
  typeof v === "string" ? v.replace(/[,()*\\%]/g, " ").trim().slice(0, 60) : "";

export async function findRounds(input: FindRoundsInput): Promise<string> {
  const admin = createAdminClient();

  let q = admin
    .from("startups")
    .select("name, slug, tagline, industry, stage, country, funding_target")
    .eq("status", "active")
    // A paused round is off the market; the browse page hides it and so does
    // this, or the assistant recommends something nobody can invest in.
    .neq("round_state", "paused")
    .limit(12);

  const industry = clean(input.industry);
  const stage = clean(input.stage);
  const country = clean(input.country);
  const text = clean(input.query);

  if (industry) q = q.ilike("industry", `%${industry}%`);
  if (stage) q = q.eq("stage", stage);
  if (country) q = q.ilike("country", `%${country}%`);
  if (text) q = q.or(`name.ilike.%${text}%,tagline.ilike.%${text}%`);
  if (Number.isFinite(input.maxRaise)) q = q.lte("funding_target", Number(input.maxRaise));
  if (Number.isFinite(input.minRaise)) q = q.gte("funding_target", Number(input.minRaise));

  const { data, error } = await q;
  if (error) return "The search failed. Say so rather than guessing at results.";
  if (!data?.length) return "No live rounds match that. Say so plainly; do not invent examples.";

  return data.map(s =>
    `- ${s.name} (/startups/${s.slug}) — ${s.tagline ?? "no pitch line"} · ${s.industry ?? "?"} · ${s.stage ?? "?"} · ${s.country ?? "?"} · raising ${safeFormatCurrency(s.funding_target) ?? "undisclosed"}`
  ).join("\n");
}
