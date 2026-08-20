import { createAdminClient } from "@/lib/supabase-server";
import { buildAccessContext, investorCan, founderCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import { safeFormatCurrency } from "@/lib/format";

/**
 * What the assistant is allowed to know about the page you are on.
 *
 * The single rule this file exists to enforce: the assistant sees exactly what
 * the VIEWER sees, and never more. It would be trivial to hand the model the
 * whole listing row and let it answer questions — and it would immediately
 * become the cheapest way past every paywall on the platform. A free investor
 * cannot read a company's MRR on the page; asking a chatbot must not be the
 * workaround.
 *
 * So the context is assembled here, server-side, from a page REFERENCE the
 * client sends (a slug, a route) rather than from text the client scraped.
 * Client-supplied context would also mean paying a model to answer questions
 * about content nobody has published.
 */

export type PageRef =
  | { kind: "listing"; slug: string }
  | { kind: "investor"; slug: string }
  | { kind: "browse" }
  | { kind: "data" }
  | { kind: "pricing" }
  | { kind: "other"; path?: string };

export interface AssistantContext {
  /** Human-readable block handed to the model as reference material. */
  text: string;
  /** What the page is, for the opening line of the panel. */
  label: string;
  /** True when some of the page's data was withheld from the model. */
  redacted: boolean;
}

const line = (label: string, value: unknown): string =>
  value === null || value === undefined || value === "" ? "" : `${label}: ${value}\n`;

export async function buildAssistantContext(
  ref: PageRef,
  userId: string | null,
): Promise<AssistantContext> {
  const admin = createAdminClient();

  const viewer = userId
    ? (await admin.from("profiles")
        .select("id, role, subscription_tier, suspended, account_status")
        .eq("id", userId).maybeSingle()).data
    : null;
  const { isLaunch } = await getLaunchStatus();
  const ctx = buildAccessContext(viewer, isLaunch);

  switch (ref.kind) {
    case "listing":
      return listingContext(admin, ref.slug, ctx, viewer?.role ?? null, userId);
    case "investor":
      return investorContext(admin, ref.slug);
    case "browse":
      return browseContext(admin);
    case "data":
      return dataContext(admin);
    case "pricing":
      return { text: PRICING_CONTEXT, label: "the pricing page", redacted: false };
    default:
      return { text: "", label: "CapitalReach", redacted: false };
  }
}

async function listingContext(
  admin: ReturnType<typeof createAdminClient>,
  slug: string,
  ctx: ReturnType<typeof buildAccessContext>,
  role: string | null,
  userId: string | null,
): Promise<AssistantContext> {
  const { data: s } = await admin
    .from("startups")
    .select("id, owner_id, name, slug, status, tagline, industry, stage, country, founded_year, problem, solution, market, competitive_advantage, use_of_funds, funding_target, equity_offered, min_check_size, mrr, arr, growth_rate, runway_months, paying_customers, user_count, vaultrise_score, round_close_date, verified_at")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (!s) return { text: "", label: "a listing", redacted: false };

  // The owner sees their own everything. Everyone else is metered exactly as
  // the page meters them.
  const isOwner = !!userId && s.owner_id === userId;
  const caps = investorCan(ctx);
  const seesNumbers = isOwner || role === "admin" || caps.viewFinancials;

  let text = "";
  text += line("Company", s.name);
  text += line("One-line pitch", s.tagline);
  text += line("Industry", s.industry);
  text += line("Stage", s.stage);
  text += line("Country", s.country);
  text += line("Founded", s.founded_year);
  text += line("Identity verified by CapitalReach", s.verified_at ? "yes" : "no");
  text += line("Raising", safeFormatCurrency(s.funding_target));
  text += line("Equity offered (%)", s.equity_offered);
  text += line("Minimum cheque", safeFormatCurrency(s.min_check_size));
  text += line("Round closes", s.round_close_date);
  text += line("AI readiness score (0-100, model-generated, not reviewed by a human)", s.vaultrise_score);
  text += line("Problem", s.problem);
  text += line("Solution", s.solution);
  text += line("Market", s.market);
  text += line("Competitive advantage", s.competitive_advantage);
  text += line("Use of funds", s.use_of_funds);

  if (seesNumbers) {
    text += line("MRR", safeFormatCurrency(s.mrr));
    text += line("ARR", safeFormatCurrency(s.arr));
    text += line("Growth rate (%/mo)", s.growth_rate);
    text += line("Runway (months)", s.runway_months);
    text += line("Paying customers", s.paying_customers);
    text += line("Users", s.user_count);
  }

  return {
    text,
    label: s.name,
    // Only claim redaction when there was something to redact.
    redacted: !seesNumbers && (s.mrr != null || s.arr != null || s.runway_months != null),
  };
}

async function investorContext(
  admin: ReturnType<typeof createAdminClient>,
  slug: string,
): Promise<AssistantContext> {
  const { data: i } = await admin
    .from("investors")
    .select("slug, type, display_name, firm_name, bio, investment_thesis, industries, stages, geography, min_check, max_check, lead_rounds, number_of_investments, verified_at, is_public, is_external")
    .eq("slug", slug).eq("is_public", true).eq("is_external", false)
    .maybeSingle();

  if (!i) return { text: "", label: "an investor profile", redacted: false };

  let text = "";
  text += line("Investor", i.firm_name || i.display_name);
  text += line("Type", i.type);
  text += line("Bio", i.bio);
  text += line("Thesis", i.investment_thesis);
  text += line("Industries", i.industries?.join(", "));
  text += line("Stages", i.stages?.join(", "));
  text += line("Geography", i.geography?.join(", "));
  text += line("Cheque size", `${safeFormatCurrency(i.min_check) ?? "?"} to ${safeFormatCurrency(i.max_check) ?? "?"}`);
  text += line("Leads rounds", i.lead_rounds ? "yes" : "no");
  text += line("Investments made", i.number_of_investments);
  text += line("Identity verified by CapitalReach", i.verified_at ? "yes" : "no");

  return { text, label: i.firm_name || i.display_name || "an investor", redacted: false };
}

async function browseContext(admin: ReturnType<typeof createAdminClient>): Promise<AssistantContext> {
  const { data } = await admin
    .from("startups")
    .select("name, slug, industry, stage, funding_target")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(60);

  const rows = (data ?? []).map(s =>
    `- ${s.name} (/startups/${s.slug}) — ${s.industry ?? "?"}, ${s.stage ?? "?"}, raising ${safeFormatCurrency(s.funding_target) ?? "undisclosed"}`
  ).join("\n");

  return {
    text: `The 60 most recent live rounds on CapitalReach:\n${rows}`,
    label: "the browse page",
    redacted: false,
  };
}

async function dataContext(admin: ReturnType<typeof createAdminClient>): Promise<AssistantContext> {
  const { computePlatformData } = await import("@/lib/platform-data");
  const d = await computePlatformData();
  if (!d) return { text: "", label: "the data centre", redacted: false };

  const byIndustry = Object.entries(d.byIndustry).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`).join(", ");
  const byStage = Object.entries(d.byStage).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`).join(", ");
  const monthly = (d.monthly ?? []).map(m => `${m.month}: ${m.listings} new listings, ${m.closed} deals closed`).join("\n");

  return {
    text: [
      `Active listings: ${d.startupCount}`,
      `Investors: ${d.investorCount}`,
      `Deals closed: ${d.dealsCount}`,
      `Live deals: ${d.activeDeals}`,
      d.closeRate != null ? `Close rate: ${d.closeRate}%` : "",
      `Listings by industry — ${byIndustry}`,
      `Listings by stage — ${byStage}`,
      `Last twelve months:\n${monthly}`,
    ].filter(Boolean).join("\n"),
    label: "the data centre",
    redacted: false,
  };
}

const PRICING_CONTEXT = `CapitalReach pricing.

Founder plans: Free (no public listing); Starter $29/mo or $259/yr; Growth $79/mo or $699/yr.
Investor plans: Explorer (free, browse only); Angel $99/mo or $879/yr; Pro Investor $249/mo or $2,190/yr; Institution (custom, contact sales).
Paying for a year costs about 25-27% less than paying monthly.

There is also a 2% success fee, charged only when a round actually closes.
It is paid by the STARTUP receiving the investment, never by the investor.
A founder can spread that fee over 2-6 monthly instalments.

During the launch period the first 100 members get every paid feature free.`;
