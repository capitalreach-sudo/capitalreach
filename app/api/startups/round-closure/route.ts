import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { isUuid } from "@/lib/utils";
import { isCurrencyCode } from "@/lib/currency";
import { recordSignal } from "@/lib/trust-signals";
import { CIRCUMVENTION_TERMS_VERSION, NON_CIRCUMVENTION_MONTHS } from "@/lib/circumvention-text";
import {
  introducedInTail,
  crossCheck,
  closureSince,
  isClosureOutcome,
  outcomeRaised,
  type ClosureOutcome,
} from "@/lib/closure";

/**
 * The round closure declaration: POST to file one, GET to read your own.
 *
 * The founder tells us how the round ended and who took part. What they cannot
 * tell us is who we introduced them to -- that comes from public.introductions,
 * is computed here, and is frozen onto the row. A client that could supply
 * `introduced_in_tail` could also supply an empty one, and the cross-check
 * would then be the founder marking their own homework.
 *
 * round_closures has RLS enabled with no permissive policy (migration 114), so
 * this route is the only way a declaration is written or read by anyone other
 * than the admin bench.
 */

/** A free-text list of investors we never knew. Long enough for a real list,
 *  short enough that the column is not a document store. */
const EXTERNAL_MAX = 2000;
/** Above this, a raise figure is a typo or an invention, not a round. */
const AMOUNT_MAX = 9_999_999_999;

function clientIp(req: NextRequest): string | null {
  // First hop of x-forwarded-for is the client, set by Vercel's edge.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

// ── GET: the founder's own record, and the list the form has to show ────────

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const admin = createAdminClient();
  // Select-star is never used on startups: migration 109 revoked the financial
  // columns from client keys, and a route that does not need them must not
  // carry them into a response by accident.
  const { data: startup } = await admin
    .from("startups")
    .select("id, name, round_state, round_state_changed_at")
    .eq("id", mine.entityId)
    .maybeSingle();
  if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [introduced, { data: rows }] = await Promise.all([
    introducedInTail(startup.id),
    admin
      .from("round_closures")
      .select("id, outcome, declared_investor_ids, declared_external, amount_raised, currency, introduced_in_tail, undeclared_introduced, attestation_version, declared_at")
      .eq("startup_id", startup.id)
      .order("declared_at", { ascending: false })
      .limit(20),
  ]);

  // Names for every id a past declaration mentions, including investors whose
  // tail has since run out -- a record that renders as a row of raw uuids is
  // not a record anybody can check.
  const historic = Array.from(new Set((rows ?? []).flatMap((r) => [
    ...(r.declared_investor_ids ?? []),
    ...(r.introduced_in_tail ?? []),
  ])));
  const missing = historic.filter((id) => !introduced.some((i) => i.investorId === id));
  const { data: extra } = missing.length
    ? await admin.from("investors").select("id, slug, display_name, firm_name").in("id", missing)
    : { data: [] as Array<{ id: string; slug: string; display_name: string | null; firm_name: string | null }> };

  const names: Record<string, string> = {};
  for (const i of introduced) names[i.investorId] = i.name ?? i.firm ?? "";
  for (const i of extra ?? []) names[i.id] = i.display_name?.trim() || i.firm_name?.trim() || "";

  const existing = await closureSince(startup.id, startup.round_state_changed_at);

  return NextResponse.json({
    startup: { id: startup.id, name: startup.name, roundState: startup.round_state },
    terms: { version: CIRCUMVENTION_TERMS_VERSION, months: NON_CIRCUMVENTION_MONTHS },
    introduced,
    names,
    // True when this round already has a declaration, so the form can show the
    // record instead of asking a second time.
    declaredForThisRound: !!existing,
    closures: (rows ?? []).map((r) => ({
      id: r.id,
      outcome: r.outcome,
      declaredInvestorIds: r.declared_investor_ids ?? [],
      declaredExternal: r.declared_external,
      amountRaised: r.amount_raised,
      currency: r.currency,
      introducedInTail: r.introduced_in_tail ?? [],
      // The count, not the list: the founder gets the fact that a cross-check
      // ran and what it found, without the page reading like a charge sheet
      // naming people who have done nothing but decline an introduction.
      undeclaredCount: (r.undeclared_introduced ?? []).length,
      attestationVersion: r.attestation_version,
      declaredAt: r.declared_at,
    })),
  });
}

// ── POST: file the declaration ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });
  // A declaration is a dated statement about the company's money, made in the
  // company's name. An invited team member can read it; binding the company to
  // it is the owner's act, or an account the owner made an admin.
  if (mine.role === "member") {
    return NextResponse.json({ error: "Only the owner can file a declaration" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const outcome = body.outcome;
  if (!isClosureOutcome(outcome)) {
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
  }

  const rawIds: unknown = body.declaredInvestorIds;
  if (rawIds !== undefined && !Array.isArray(rawIds)) {
    return NextResponse.json({ error: "declaredInvestorIds must be an array" }, { status: 400 });
  }
  const askedIds = Array.from(new Set((Array.isArray(rawIds) ? rawIds : []).filter(isUuid))).slice(0, 200);

  const rawExternal: unknown = body.declaredExternal;
  if (rawExternal !== undefined && rawExternal !== null && typeof rawExternal !== "string") {
    return NextResponse.json({ error: "declaredExternal must be a string" }, { status: 400 });
  }
  const declaredExternal = typeof rawExternal === "string" ? rawExternal.trim().slice(0, EXTERNAL_MAX) || null : null;

  const rawAmount: unknown = body.amountRaised;
  let amountRaised: number | null = null;
  if (rawAmount !== undefined && rawAmount !== null && rawAmount !== "") {
    const n = typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
    if (!Number.isFinite(n) || n < 0 || n > AMOUNT_MAX) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    amountRaised = Math.round(n);
  }
  const currency = isCurrencyCode(body.currency) ? body.currency : null;

  // A round that did not happen has no proceeds. Storing an amount against
  // "no raise" would put two contradictory statements on one signed row.
  if (!outcomeRaised(outcome as ClosureOutcome)) amountRaised = null;

  const admin = createAdminClient();

  // The declared ids are narrowed to investors that actually exist. The form
  // only offers the introduced list, so anything else is either a stale tab or
  // a hand-rolled request, and neither belongs in evidence as a bare uuid.
  const { data: realInvestors } = askedIds.length
    ? await admin.from("investors").select("id").in("id", askedIds)
    : { data: [] as Array<{ id: string }> };
  const declaredInvestorIds = (realInvestors ?? []).map((r) => r.id);

  // Computed here, never accepted from the client: a caller that could send
  // its own introduced list could send an empty one.
  const introduced = await introducedInTail(mine.entityId);
  const introducedIds = introduced.map((i) => i.investorId);
  const undeclared = crossCheck(declaredInvestorIds, introducedIds);

  const { data: closure, error } = await admin
    .from("round_closures")
    .insert({
      startup_id: mine.entityId,
      declared_by: user.id,
      outcome,
      declared_investor_ids: declaredInvestorIds,
      declared_external: declaredExternal,
      amount_raised: amountRaised,
      currency: amountRaised === null ? null : currency,
      introduced_in_tail: introducedIds,
      undeclared_introduced: undeclared,
      // The terms as they stand today, stamped on the statement. A later bump
      // does not reach back and restate what this founder declared under.
      attestation_version: CIRCUMVENTION_TERMS_VERSION,
      ip: clientIp(req),
      user_agent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
    })
    .select("id, declared_at, outcome, undeclared_introduced")
    .single();

  if (error || !closure) {
    console.error("[round-closure] insert failed:", error?.message);
    return NextResponse.json({ error: "Failed to record the declaration" }, { status: 500 });
  }

  await raiseLead({
    startupId: mine.entityId,
    closureId: closure.id,
    outcome: outcome as ClosureOutcome,
    introduced,
    declaredCount: declaredInvestorIds.length,
    undeclared,
    amountRaised,
    currency,
  });

  return NextResponse.json({
    success: true,
    closure: {
      id: closure.id,
      outcome: closure.outcome,
      declaredAt: closure.declared_at,
      undeclaredCount: undeclared.length,
    },
  });
}

interface LeadInput {
  startupId: string;
  closureId: string;
  outcome: ClosureOutcome;
  introduced: Awaited<ReturnType<typeof introducedInTail>>;
  /** How many introduced investors the founder actually named. */
  declaredCount: number;
  undeclared: string[];
  amountRaised: number | null;
  currency: string | null;
}

/**
 * When a declaration contradicts the introduction record, put it in front of a
 * human -- and only then.
 *
 * The contradiction has a specific shape: the founder states that money came
 * in, names NOBODY we introduced, and people we introduced are still inside
 * their tail with an NDA or a disclosure history. That is the pattern a leaked
 * fee actually makes, and it is a conflict between two dated records rather
 * than a suspicion about a person.
 *
 * The two exclusions are deliberate, and each removes noise rather than
 * evidence:
 *   -- a declaration that NAMES one of our investors is already the basis of a
 *      fee, so a reviewer has nothing to resolve; the other names on the list
 *      are investors who passed, which is what a successful raise looks like;
 *   -- an outcome that raised nothing owes nothing, so there is no fee to leak.
 *
 * The restraint matters because circumvention_reported carries 30 points in
 * SIGNAL_WEIGHTS, enough on its own to route a subject into the enhanced review
 * lane. Raising it on every honest close would put every founder who closes
 * here under review and make the signal worthless for the case it exists for.
 *
 * Nothing is lost by it either: the full undeclared list is on the row
 * regardless, and migration 114 indexes exactly that (round_closures_flagged_idx)
 * so the bench can read every non-empty cross-check without a signal at all.
 *
 * Never an accusation, in any shape. It records that two records disagree and
 * attaches the declaration, so a person decides what that means.
 */
async function raiseLead(input: LeadInput): Promise<void> {
  const { startupId, closureId, outcome, introduced, declaredCount, undeclared, amountRaised, currency } = input;

  if (!undeclared.length) return;
  if (!outcomeRaised(outcome)) return;
  if (declaredCount > 0) return;

  const inScope = introduced.filter((i) => undeclared.includes(i.investorId));
  const withFootprint = inScope.filter((i) => i.ndaSigned || i.disclosures > 0);

  await recordSignal("startup", startupId, "circumvention_reported", "medium", {
    // The lead, in the words of the record rather than of a conclusion.
    reason: "declared_raise_named_no_introduced_investor",
    closure_id: closureId,
    outcome,
    amount_raised: amountRaised,
    currency,
    undeclared_count: undeclared.length,
    undeclared_with_nda_or_disclosures: withFootprint.length,
    undeclared: inScope.slice(0, 25).map((i) => ({
      investor_id: i.investorId,
      first_contact_at: i.firstContactAt,
      channel: i.channel,
      tail_ends_at: i.tailEndsAt,
      nda_signed: i.ndaSigned,
      disclosures: i.disclosures,
    })),
    terms_version: CIRCUMVENTION_TERMS_VERSION,
  });
}
