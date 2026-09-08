import { createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";
import { withinTail } from "@/lib/introductions";

/**
 * The closing question.
 *
 * Everything else in this layer records what happened on the way in: an
 * introduction, an acknowledgment, an NDA, a log of what was handed over. None
 * of it says how the round ended, and the fee is due at exactly that moment.
 * A platform that never asks has to reconstruct the answer from silence, and
 * silence is not evidence of anything.
 *
 * So the founder is asked, with the names on screen. That single change turns
 * an omission into a statement: a founder who forgot is a different person
 * from a founder who read a list of six investors we introduced them to, ticked
 * none of them, and dated it. The first is an accident; the second is the only
 * thing a fee claim, or a decision not to make one, can rest on.
 *
 * Service-role only. round_closures, introductions, nda_records and
 * nda_disclosures all have RLS enabled with no permissive policy, so every read
 * here is reachable exclusively from server code that has already established
 * the caller is party to the record.
 */

/** Must match the CHECK constraint on round_closures.outcome (migration 114). */
export const CLOSURE_OUTCOMES = [
  "closed_with_platform_investor",
  "closed_other_investors",
  "closed_no_raise",
  "withdrawn",
] as const;
export type ClosureOutcome = (typeof CLOSURE_OUTCOMES)[number];

export function isClosureOutcome(v: unknown): v is ClosureOutcome {
  return typeof v === "string" && (CLOSURE_OUTCOMES as readonly string[]).includes(v);
}

/** Outcomes that assert money actually came in. Nothing is owed on a round
 *  that did not happen, so the two cases are kept apart everywhere. */
export function outcomeRaised(outcome: ClosureOutcome): boolean {
  return outcome === "closed_with_platform_investor" || outcome === "closed_other_investors";
}

// ── Who we introduced, and what they got ────────────────────────────────────

/**
 * One introduced investor, with enough to put them in front of the founder by
 * name. The contact email is deliberately absent: this screen exists because
 * somebody may have gone around the platform, and it would be absurd for it to
 * hand out a route around the platform.
 */
export interface IntroducedInvestor {
  investorId: string;
  slug: string | null;
  /** What to call them: their display name, or the firm when that is all we have. */
  name: string | null;
  firm: string | null;
  type: string | null;
  firstContactAt: string;
  channel: string;
  tailEndsAt: string;
  /** Signed our NDA for this listing, and the term has not run out. */
  ndaSigned: boolean;
  ndaSignedAt: string | null;
  /** How many items were logged as disclosed to them. */
  disclosures: number;
}

/** Enough disclosure rows to answer "how many" without dragging a whole log
 *  into memory. Past this the count renders as the cap, which is still the
 *  honest answer to the question the form asks: "a lot". */
const DISCLOSURE_SCAN_CAP = 5000;

/**
 * Every investor we introduced to this startup whose non-circumvention tail is
 * still live, oldest introduction first.
 *
 * Liveness is decided by withinTail() rather than by a second inline date
 * comparison, so the form, the cross-check and the disclosure log can never
 * disagree about whether a tail has run out. The SQL bound is a prefilter for
 * size only.
 */
export async function introducedInTail(startupId: string): Promise<IntroducedInvestor[]> {
  if (!isUuid(startupId)) return [];

  try {
    const admin = createAdminClient();
    const { data: intros } = await admin
      .from("introductions")
      .select("investor_id, first_contact_at, channel, tail_ends_at")
      .eq("startup_id", startupId)
      // Generous prefilter: the authority on "still live" is withinTail().
      .gt("tail_ends_at", new Date(Date.now() - 86_400_000).toISOString())
      .order("first_contact_at", { ascending: true })
      .limit(500);

    const live = (intros ?? []).filter((i) => withinTail(i));
    if (!live.length) return [];

    const ids = Array.from(new Set(live.map((i) => i.investor_id)));

    const [{ data: investors }, { data: ndas }, { data: events }] = await Promise.all([
      admin.from("investors").select("id, slug, display_name, firm_name, type").in("id", ids),
      admin
        .from("nda_records")
        .select("investor_id, signed_at, obligations_end_at")
        .eq("startup_id", startupId)
        .in("investor_id", ids),
      admin
        .from("nda_disclosures")
        .select("investor_id")
        .eq("startup_id", startupId)
        .in("investor_id", ids)
        .limit(DISCLOSURE_SCAN_CAP),
    ]);

    const investorById = new Map((investors ?? []).map((i) => [i.id, i]));

    // Signed beats unsigned when a pair somehow has more than one record: the
    // question the form asks is whether they signed, and one signature is a yes.
    const ndaByInvestor = new Map<string, { signed_at: string | null }>();
    for (const n of ndas ?? []) {
      const prior = ndaByInvestor.get(n.investor_id);
      if (!prior?.signed_at) ndaByInvestor.set(n.investor_id, { signed_at: n.signed_at });
    }

    const counts = new Map<string, number>();
    for (const e of events ?? []) counts.set(e.investor_id, (counts.get(e.investor_id) ?? 0) + 1);

    return live.map((intro) => {
      const inv = investorById.get(intro.investor_id) ?? null;
      const nda = ndaByInvestor.get(intro.investor_id) ?? null;
      const display = inv?.display_name?.trim() || null;
      const firm = inv?.firm_name?.trim() || null;
      return {
        investorId: intro.investor_id,
        slug: inv?.slug ?? null,
        name: display ?? firm,
        // Never repeat the name in the second slot: "Acme · Acme" reads as a bug.
        firm: firm && firm !== display ? firm : null,
        type: inv?.type ?? null,
        firstContactAt: intro.first_contact_at,
        channel: intro.channel,
        tailEndsAt: intro.tail_ends_at,
        ndaSigned: !!nda?.signed_at,
        ndaSignedAt: nda?.signed_at ?? null,
        disclosures: counts.get(intro.investor_id) ?? 0,
      };
    });
  } catch (err) {
    console.warn("[closure] could not read introductions in tail:", err);
    return [];
  }
}

// ── The cross-check ─────────────────────────────────────────────────────────

/**
 * Introduced, tail still live, and not named in the declaration.
 *
 * Returned in the order the introductions were made, so the list a reviewer
 * reads and the list the founder saw are in the same sequence. Deliberately a
 * set difference and nothing more: this function decides what a human looks
 * at, never what anybody is accused of.
 */
export function crossCheck(declaredIds: readonly string[], introducedIds: readonly string[]): string[] {
  const declared = new Set(declaredIds.filter(isUuid));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of introducedIds) {
    if (!isUuid(id) || declared.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// ── Has this round already been declared? ───────────────────────────────────

export interface ClosureStub {
  id: string;
  outcome: string;
  declaredAt: string;
  undeclaredCount: number;
}

/**
 * The most recent declaration filed at or after `since`, if there is one.
 *
 * `since` is what makes "this round" a real boundary rather than a guess: a
 * company that closed in January, declared, reopened in March and closed again
 * in September owes a second declaration, because the first one is a statement
 * about a round that had already ended when the new one began. Pass the moment
 * the round last changed state and the answer follows from the record instead
 * of from an assumption about how many rounds a company has.
 */
export async function closureSince(startupId: string, since: string | null): Promise<ClosureStub | null> {
  if (!isUuid(startupId)) return null;
  try {
    const admin = createAdminClient();
    let q = admin
      .from("round_closures")
      .select("id, outcome, declared_at, undeclared_introduced")
      .eq("startup_id", startupId)
      .order("declared_at", { ascending: false })
      .limit(1);
    if (since && !Number.isNaN(new Date(since).getTime())) q = q.gte("declared_at", since);

    const { data } = await q.maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      outcome: data.outcome,
      declaredAt: data.declared_at,
      undeclaredCount: (data.undeclared_introduced ?? []).length,
    };
  } catch {
    // A read that fails must not be reported as "already declared" -- that
    // would silently drop the one question this whole layer exists to ask.
    return null;
  }
}
