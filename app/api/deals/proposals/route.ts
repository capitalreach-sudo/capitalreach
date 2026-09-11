import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";
import { isCurrencyCode, DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { mayInvestorContact } from "@/lib/contact-policy";
import { getSafetyConfig, maskFreeText } from "@/lib/message-safety";
import { restrictionsFor } from "@/lib/fee-enforcement";

/**
 * Deal proposals: the consent step in front of every deal (migration 091),
 * and since migration 118 the OFFER an investor opens with.
 *
 * GET                                  -- my proposals, incoming and outgoing.
 * GET  ?startupId=<uuid>               -- one listing's state, for the offer button.
 * POST { startupId, amount, terms }    -- an investor's offer.
 * PATCH { id, action: "accept" | "decline" | "withdraw" | "counter" }
 *
 * The rules that do the work here:
 *  - Only the RECIPIENT side may accept, decline or counter, and only the
 *    PROPOSER may withdraw. Which side the caller is on is resolved from
 *    ownership, never trusted from the request.
 *  - Accepting re-checks the world before creating anything: the round may
 *    have closed and a deal may have appeared through another path since the
 *    proposal was sent. A stale yes must not create a deal the checks at
 *    proposal time would have refused.
 *  - An offer carries a NUMBER. The whole point of putting the offer before
 *    the conversation is that a founder's inbox stops filling with "love what
 *    you're building, quick call?" and starts carrying terms, so an offer
 *    without an amount is refused rather than quietly stored as null.
 *  - The terms an investor offers may differ from the listing's ask. That is
 *    not an error state; it is the negotiation. Nothing here compares the two.
 */

type Sides = { startupSide: boolean; investorSide: boolean; startupId: string | null; investorId: string | null };

type Admin = ReturnType<typeof createAdminClient>;

async function mySides(userId: string): Promise<Sides> {
  const [st, inv] = await Promise.all([
    resolveEntity(userId, "startup"),
    resolveEntity(userId, "investor"),
  ]);
  return {
    startupSide: !!st, investorSide: !!inv,
    startupId: st?.entityId ?? null, investorId: inv?.entityId ?? null,
  };
}

// ── Terms ───────────────────────────────────────────────────────────────────

/** The plausibility ceiling: lib/format.ts renders anything above it as an
 *  absence, so storing past it only guarantees a figure nobody can read back. */
const MAX_MONEY = 9_999_999_999;

interface Terms {
  amount: number | null;
  currency: string;
  equity_pct: number | null;
  valuation: number | null;
  instrument: string | null;
  conditions: string | null;
  note: string | null;
}

/** A positive figure, or null. Strings are accepted because a money input is a
 *  text field everywhere in this product ("1,500,000" is what people type). */
function positive(v: unknown, max: number, decimals = 0): number | null {
  const raw = typeof v === "number" ? v
    : typeof v === "string" ? Number(v.replace(/[^0-9.]/g, ""))
    : NaN;
  if (!Number.isFinite(raw) || raw <= 0 || raw > max) return null;
  const f = 10 ** decimals;
  return Math.round(raw * f) / f;
}

function text(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** Instrument is free-form on purpose (see migration 118): a real term sheet is
 *  not an enum, and forcing one only pushes the substance into the note. */
function readTerms(body: Record<string, unknown>): Terms {
  return {
    amount: positive(body.amount, MAX_MONEY),
    currency: isCurrencyCode(body.currency) ? body.currency : DEFAULT_CURRENCY,
    equity_pct: positive(body.equityPct, 100, 2),
    valuation: positive(body.valuation, MAX_MONEY),
    instrument: text(body.instrument, 40),
    conditions: text(body.conditions, 2000),
    note: text(body.note, 2000),
  };
}

/**
 * The prose half of an offer, masked.
 *
 * An offer is now the FIRST thing an investor sends a founder and, until it is
 * accepted, the only thing. That makes `note` the highest-value place on the
 * platform to write "reach me at ..." -- it reaches the founder's inbox and
 * their email whether or not they ever accept. `conditions` is the same field
 * wearing a term-sheet hat. Both go through the same masking as a message.
 */
async function maskTerms(terms: Terms, subject: { type: "investor" | "startup"; id: string }): Promise<Terms> {
  const config = await getSafetyConfig();
  const pass = async (value: string | null, surface: "offer_note" | "offer_conditions") =>
    value
      ? (await maskFreeText({
          text: value, surface, subjectType: subject.type, subjectId: subject.id, config,
        })).text
      : null;
  return {
    ...terms,
    note: await pass(terms.note, "offer_note"),
    conditions: await pass(terms.conditions, "offer_conditions"),
  };
}

/** One line of the agreed terms for the deal timeline. Only what has a value:
 *  an absent term is absent, not "null". */
function describeTerms(p: {
  amount: number | null; currency: string | null; equity_pct: number | null;
  valuation: number | null; instrument: string | null; conditions: string | null;
}): string | null {
  const parts: string[] = [];
  if (p.amount != null) parts.push(formatMoney(p.amount, p.currency));
  if (p.equity_pct != null) parts.push(`${p.equity_pct}% equity`);
  if (p.valuation != null) parts.push(`at ${formatMoney(p.valuation, p.currency)}`);
  if (p.instrument) parts.push(p.instrument.replace(/_/g, " "));
  if (parts.length === 0 && !p.conditions) return null;
  const head = parts.length ? `Offer accepted: ${parts.join(" · ")}` : "Offer accepted";
  return p.conditions ? `${head}\nConditions: ${p.conditions}` : head;
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const sides = await mySides(user.id);

  // Scoped read: what should the offer button on THIS listing say? The verdict
  // comes from lib/contact-policy so the button and the routes that refuse a
  // message can never drift apart.
  const scopedTo = req.nextUrl.searchParams.get("startupId");
  if (scopedTo !== null) {
    if (!isUuid(scopedTo)) return NextResponse.json({ error: "startupId must be a uuid" }, { status: 400 });
    return listingState(admin, scopedTo, sides.investorId, user.id);
  }

  if (!sides.startupId && !sides.investorId) return NextResponse.json({ incoming: [], outgoing: [] });

  const filters: string[] = [];
  if (sides.startupId) filters.push(`startup_id.eq.${sides.startupId}`);
  if (sides.investorId) filters.push(`investor_id.eq.${sides.investorId}`);

  const COLS = "id, startup_id, investor_id, from_side, status, amount, currency, equity_pct, valuation, instrument, conditions, counters_id, opening_status, note, created_at, startup:startups(name, slug, logo_url, logo_color, funding_target, equity_offered, min_check_size, stage), investor:investors(display_name, firm_name, slug, logo_url, logo_color)";

  // The error is read, not discarded. A select naming a column that does not
  // exist answers 400, and with `const { data }` that arrived as data: null
  // and went out as {incoming: [], outgoing: []} -- an empty deal portal for
  // everybody, with a 200 on it and nothing in any log. That is exactly how a
  // typo in this list reached production and stayed invisible.
  const { data, error: listErr } = await admin
    .from("deal_proposals")
    .select(COLS)
    .or(filters.join(","))
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  if (listErr) {
    console.error("[proposals] list failed:", listErr.message);
    return NextResponse.json({ error: "Could not read your proposals" }, { status: 500 });
  }

  // The rounds a live proposal ANSWERS. Migration 091 permits one pending
  // proposal per pair, so every earlier round has already been closed and the
  // status filter above excludes all of them -- which meant a three-round
  // negotiation arrived as one card with no history, and the client's chain
  // rendering could never fire. Walked by counters_id rather than by pair, so
  // only the rounds actually in the chain are read.
  const ancestors: typeof data = [] as never;
  {
    let frontier = (data ?? []).map((p) => p.counters_id).filter(Boolean) as string[];
    const seen = new Set<string>(frontier);
    for (let depth = 0; depth < 12 && frontier.length; depth++) {
      const { data: prev, error: prevErr } = await admin
        .from("deal_proposals").select(COLS).in("id", frontier).limit(50);
      // A chain that cannot be read is a shorter chain, not a broken page:
      // the live round is already in hand and is the one that matters.
      if (prevErr) { console.warn("[proposals] chain walk failed:", prevErr.message); break; }
      if (!prev?.length) break;
      (ancestors as unknown[]).push(...prev);
      frontier = prev
        .map((p) => p.counters_id)
        .filter((id): id is string => !!id && !seen.has(id));
      frontier.forEach((id) => seen.add(id));
    }
  }

  const rows = [...(data ?? []), ...(ancestors ?? [])].map(p => {
    const st = p.startup as unknown as {
      name: string; slug: string; logo_url: string | null; logo_color: string | null;
      funding_target: number | null; equity_offered: number | null;
      min_check_size: number | null; stage: string | null;
    } | null;
    const inv = p.investor as unknown as { display_name: string | null; firm_name: string | null; slug: string; logo_url: string | null; logo_color: string | null } | null;
    // Incoming = the OTHER side proposed it to an entity I own.
    const mine = p.from_side === "startup" ? p.startup_id === sides.startupId : p.investor_id === sides.investorId;
    return {
      id: p.id,
      direction: mine ? "outgoing" : "incoming",
      fromSide: p.from_side,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      // The terms (118). Additive: an inbox that ignores them still renders.
      equityPct: p.equity_pct,
      valuation: p.valuation,
      instrument: p.instrument,
      conditions: p.conditions,
      /** Set when this proposal answers an earlier one, so a negotiation reads
       *  as a chain rather than a pile of unrelated offers. */
      countersId: p.counters_id,
      openingStatus: p.opening_status,
      note: p.note,
      createdAt: p.created_at,
      startupId: p.startup_id,
      /** What the company advertised, so a counter is written against the ask
       *  rather than only against the previous round. Read here because 109
       *  revoked these columns from client keys. */
      ask: st ? {
        fundingTarget: st.funding_target ?? null,
        equityOffered: st.equity_offered ?? null,
        minCheck: st.min_check_size ?? null,
        stage: st.stage ?? null,
      } : null,
      counterpart: p.from_side === "startup"
        ? (mine ? { kind: "investor", name: inv?.firm_name || inv?.display_name || "Investor", logoUrl: inv?.logo_url ?? null, logoColor: inv?.logo_color ?? null }
                : { kind: "startup", name: st?.name ?? "Startup", slug: st?.slug, logoUrl: st?.logo_url ?? null, logoColor: st?.logo_color ?? null })
        : (mine ? { kind: "startup", name: st?.name ?? "Startup", slug: st?.slug, logoUrl: st?.logo_url ?? null, logoColor: st?.logo_color ?? null }
                : { kind: "investor", name: inv?.firm_name || inv?.display_name || "Investor", logoUrl: inv?.logo_url ?? null, logoColor: inv?.logo_color ?? null }),
    };
  });

  return NextResponse.json({
    incoming: rows.filter(r => r.direction === "incoming"),
    outgoing: rows.filter(r => r.direction === "outgoing"),
  });
}

/**
 * One listing, one investor: may they talk yet, and what is already on the
 * table? Everything read here belongs to the caller's own pair -- their
 * proposal, their deal, their thread -- so there is nothing to leak.
 */
async function listingState(admin: Admin, startupId: string, investorId: string | null, userId: string) {
  // A founder reading someone else's listing has no offer to make. Saying so
  // plainly beats an empty proposal object the client has to interpret.
  if (!investorId) {
    return NextResponse.json({ scope: "listing", role: "none", contactOpen: false, proposal: null, dealId: null, threadId: null });
  }

  const verdict = await mayInvestorContact({ startupId, investorId });

  const [{ data: proposal }, { data: deal }, { data: thread }, { data: attest }] = await Promise.all([
    admin
      .from("deal_proposals")
      .select("id, from_side, status, amount, currency, equity_pct, valuation, instrument, conditions, note, created_at")
      .match({ startup_id: startupId, investor_id: investorId })
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle(),
    admin
      .from("deals").select("id, status")
      .match({ startup_id: startupId, investor_id: investorId })
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle(),
    admin
      .from("threads").select("id")
      .match({ startup_id: startupId, investor_id: investorId })
      .limit(1).maybeSingle(),
    // POST refuses an offer from an investor who has not certified their
    // status. Since an offer is now the only way to reach a founder, that
    // refusal is the difference between a marketplace and a wall, and the
    // button has to say so BEFORE the composer takes a page of terms.
    admin
      .from("profiles").select("accreditation_certified, role").eq("id", userId).maybeSingle(),
  ]);

  // Every messaging route lets an admin through -- send, start, reply and
  // attach each test role !== "admin" before consulting the gate -- but this
  // endpoint decides whether the BUTTON appears, and it was asking the pair
  // question alone. The admin was therefore refused a control that the route
  // behind it would have honoured, which reads as the gate being broken
  // rather than as one surface disagreeing with another.
  const isAdmin = attest?.role === "admin";

  return NextResponse.json({
    scope: "listing",
    role: "investor",
    contactOpen: verdict.allowed || isAdmin,
    reason: isAdmin && !verdict.allowed ? "admin" : verdict.reason,
    accredited: !!attest?.accreditation_certified,
    proposal: proposal
      ? {
          id: proposal.id,
          fromSide: proposal.from_side,
          status: proposal.status,
          amount: proposal.amount,
          currency: proposal.currency,
          equityPct: proposal.equity_pct,
          valuation: proposal.valuation,
          instrument: proposal.instrument,
          conditions: proposal.conditions,
          note: proposal.note,
          createdAt: proposal.created_at,
        }
      : null,
    dealId: deal?.id ?? null,
    dealStatus: deal?.status ?? null,
    threadId: thread?.id ?? null,
  });
}

// ── POST: an investor's offer ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const startupId = typeof body.startupId === "string" ? body.startupId : "";
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const sides = await mySides(user.id);
  // Founders are never gated, and they are also never the ones making an offer
  // here: their route into a pipeline is /api/deals/create, which raises the
  // startup-side proposal. This endpoint is the investor's opening position.
  if (!sides.investorId) {
    return NextResponse.json({ error: "Only investors make offers." }, { status: 403 });
  }

  const rawTerms = readTerms(body);
  if (rawTerms.amount === null) {
    return NextResponse.json({ error: "An offer needs a number." }, { status: 400 });
  }
  const terms = await maskTerms(rawTerms, { type: "investor", id: sides.investorId });

  // Counted after validation so a malformed body cannot burn the day's budget,
  // and before any write, because each of these lands in a founder's inbox.
  { const rl = await dbRateLimit(user.id, "deal_offer", ...Object.values(RATE.perDay(25)) as [number, number]);
    if (!rl.ok) return NextResponse.json({ error: "You've made a lot of offers today. Try again tomorrow." }, { status: 429 }); }

  const admin = createAdminClient();

  // Browsing is open to everyone; putting money on the table is not.
  const { data: attest } = await admin
    .from("profiles").select("accreditation_certified").eq("id", user.id).maybeSingle();
  if (!attest?.accreditation_certified) {
    return NextResponse.json(
      { error: "Confirm your investor status in Settings before making an offer.",
        messageKey: "offerComposer.notAccredited" },
      { status: 403 },
    );
  }

  const { data: st } = await admin
    .from("startups").select("id, status, round_state, owner_id").eq("id", startupId).maybeSingle();
  if (!st) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  if (st.owner_id === user.id) return NextResponse.json({ error: "That is your own listing." }, { status: 403 });
  if (st.status !== "active") return NextResponse.json({ error: "That startup is not currently listed" }, { status: 409 });
  if (st.round_state === "closed" || st.round_state === "paused") {
    return NextResponse.json(
      { error: st.round_state === "closed" ? "This round is closed to new investors." : "This round is paused by the founder." },
      { status: 409 },
    );
  }

  // The non-circumvention acknowledgment is the spine of the whole record, so
  // it is enforced here and not only in the UI. 428 = show the modal and retry.
  const { data: ack } = await admin
    .from("circumvention_acks").select("id")
    .match({ investor_id: user.id, startup_id: st.id })
    .maybeSingle();
  if (!ack) {
    return NextResponse.json(
      { error: "Please acknowledge the non-circumvention terms first.", code: "ACK_REQUIRED", startupId: st.id },
      { status: 428 },
    );
  }

  // A deal already on the record means the conversation is already open; an
  // offer would be answering a question nobody is asking.
  const { data: existingDeal } = await admin
    .from("deals").select("id")
    .match({ startup_id: st.id, investor_id: sides.investorId })
    .not("status", "in", "(closed,passed)")
    .limit(1).maybeSingle();
  if (existingDeal) {
    return NextResponse.json(
      { error: "You already have an open deal with this company.", dealId: existingDeal.id },
      { status: 409 },
    );
  }

  const { data: proposal, error } = await admin
    .from("deal_proposals")
    .insert({
      startup_id: st.id,
      investor_id: sides.investorId,
      proposed_by: user.id,
      from_side: "investor",
      amount: terms.amount,
      currency: terms.currency,
      equity_pct: terms.equity_pct,
      valuation: terms.valuation,
      instrument: terms.instrument,
      conditions: terms.conditions,
      note: terms.note,
      // A process has one entrance: every deal begins at "Talking", whatever
      // stage the two parties feel they are at.
      opening_status: "intro",
      circumvention_ack_id: ack.id,
    })
    .select("id")
    .single();

  if (error || !proposal) {
    // Migration 091's partial unique index: one live proposal per pair.
    if (error?.code === "23505") {
      return NextResponse.json({ error: "You already have an offer waiting with this company." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to send the offer" }, { status: 500 });
  }

  await notifyOffer(admin, {
    startupId: st.id, investorId: sides.investorId, fromSide: "investor",
    actorId: user.id, amount: terms.amount, currency: terms.currency, isCounter: false,
  });

  return NextResponse.json({ success: true, proposal: { id: proposal.id, status: "pending" } });
}

// ── PATCH: answer one ───────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { id, action } = body as { id?: string; action?: string };
  if (!isUuid(id ?? "")) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!["accept", "decline", "withdraw", "counter"].includes(action ?? "")) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const admin = createAdminClient();
  const { data: p } = await admin.from("deal_proposals").select("*").eq("id", id!).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (p.status !== "pending") return NextResponse.json({ error: "This request was already answered." }, { status: 409 });

  const sides = await mySides(user.id);
  const iAmStartupParty = sides.startupId === p.startup_id;
  const iAmInvestorParty = sides.investorId === p.investor_id;
  if (!iAmStartupParty && !iAmInvestorParty) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const iAmProposerSide = p.from_side === "startup" ? iAmStartupParty : iAmInvestorParty;

  if (action === "withdraw") {
    if (!iAmProposerSide) return NextResponse.json({ error: "Only the sender can withdraw a request." }, { status: 403 });
    await admin.from("deal_proposals").update({ status: "withdrawn", resolved_at: new Date().toISOString() }).eq("id", id!);
    return NextResponse.json({ success: true, status: "withdrawn" });
  }

  // accept / decline / counter: recipient only. The proposer answering their
  // own request is the unilateral deal this table exists to prevent.
  if (iAmProposerSide) return NextResponse.json({ error: "The other side has to answer this one." }, { status: 403 });

  if (action === "decline") {
    await admin.from("deal_proposals").update({ status: "declined", resolved_at: new Date().toISOString() }).eq("id", id!);
    await notifyResolution(admin, p, user.id, false);
    return NextResponse.json({ success: true, status: "declined" });
  }

  // ── Counter ─────────────────────────────────────────────────────────────
  // The third answer this table always needed. A counter is a NEW proposal
  // pointing at the one it answers, from the other side, so the negotiation
  // reads end to end: who asked what, what came back, where it landed.
  if (action === "counter") {
    const rawTerms = readTerms(body);
    if (rawTerms.amount === null) {
      return NextResponse.json({ error: "A counter needs a number." }, { status: 400 });
    }
    // A counter comes from whichever side is answering, and a founder writing
    // "just call me" into one is the same leak as an investor doing it.
    const counterSide = sides.startupId === p.startup_id
      ? { type: "startup" as const, id: sides.startupId }
      : { type: "investor" as const, id: p.investor_id };
    const terms = await maskTerms(rawTerms, counterSide);

    { const rl = await dbRateLimit(user.id, "deal_counter", ...Object.values(RATE.perDay(50)) as [number, number]);
      if (!rl.ok) return NextResponse.json({ error: "That is a lot of counters for one day. Try again tomorrow." }, { status: 429 }); }

    const { data: existingDeal } = await admin
      .from("deals").select("id")
      .match({ startup_id: p.startup_id, investor_id: p.investor_id })
      .not("status", "in", "(closed,passed)")
      .limit(1).maybeSingle();
    if (existingDeal) {
      return NextResponse.json({ error: "A deal with this partner already exists." }, { status: 409 });
    }

    // Migration 091 allows ONE pending proposal per pair, so the offer being
    // answered has to leave 'pending' before its answer can exist.
    if (!(await closeAsCountered(admin, id!))) {
      return NextResponse.json({ error: "This request was already answered." }, { status: 409 });
    }

    const { data: next, error: insErr } = await admin
      .from("deal_proposals")
      .insert({
        startup_id: p.startup_id,
        investor_id: p.investor_id,
        proposed_by: user.id,
        // The answer comes from the other side of the table, by definition.
        from_side: p.from_side === "investor" ? "startup" : "investor",
        counters_id: p.id,
        amount: terms.amount,
        currency: terms.currency,
        equity_pct: terms.equity_pct,
        valuation: terms.valuation,
        instrument: terms.instrument,
        conditions: terms.conditions,
        note: terms.note,
        opening_status: p.opening_status,
        // The acknowledgment that governs this pair did not change because the
        // number did. Carrying it means accepting a counter still lands a deal
        // with its ack attached.
        circumvention_ack_id: p.circumvention_ack_id,
      })
      .select("id")
      .single();

    if (insErr || !next) {
      // Put the original back. A negotiation must never end because a write
      // failed halfway: nothing in this route may be one-way.
      await admin.from("deal_proposals")
        .update({ status: "pending", resolved_at: null })
        .eq("id", id!)
        .then(undefined, () => {});
      if (insErr?.code === "23505") {
        return NextResponse.json({ error: "Another offer with this partner is already waiting." }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to send the counter" }, { status: 500 });
    }

    await notifyOffer(admin, {
      startupId: p.startup_id, investorId: p.investor_id,
      fromSide: p.from_side === "investor" ? "startup" : "investor",
      actorId: user.id, amount: terms.amount, currency: terms.currency, isCounter: true,
    });

    return NextResponse.json({
      success: true,
      status: "countered",
      proposal: { id: next.id, status: "pending" },
    });
  }

  // ── Accept ──────────────────────────────────────────────────────────────
  // Re-check the world. Time has passed since the proposal; a stale yes must
  // not create a deal the proposal-time checks would have refused.
  const { data: st } = await admin
    .from("startups").select("id, status, round_state").eq("id", p.startup_id).maybeSingle();
  if (!st || st.status !== "active") {
    return NextResponse.json({ error: "That listing is no longer live." }, { status: 409 });
  }
  if (p.from_side === "investor" && (st.round_state === "closed" || st.round_state === "paused")) {
    return NextResponse.json({ error: "The round is no longer open to new investors." }, { status: 409 });
  }

  // An unpaid success fee freezes what a company may NEWLY take from the
  // platform, and a new deal is exactly that. Nothing they already have is
  // touched, and paying the invoice lifts this within the hour. The investor
  // is told that the company cannot open deals, not why: another company's
  // arrears are not their business.
  const restriction = await restrictionsFor(p.startup_id);
  if (restriction.accountRestricted) {
    return NextResponse.json({
      error: iAmStartupParty
        ? "An unpaid platform invoice is holding new deals. Settle it and this opens again."
        : "This company cannot open new deals right now.",
    }, { status: 409 });
  }

  const { data: existing } = await admin
    .from("deals").select("id")
    .eq("startup_id", p.startup_id).eq("investor_id", p.investor_id)
    .not("status", "in", "(closed,passed)")
    .limit(1).maybeSingle();
  if (existing) {
    await admin.from("deal_proposals").update({ status: "accepted", resolved_at: new Date().toISOString() }).eq("id", id!);
    return NextResponse.json({ error: "A deal with this partner already exists." }, { status: 409 });
  }

  const { data: deal, error } = await admin
    .from("deals")
    .insert({
      startup_id: p.startup_id,
      investor_id: p.investor_id,
      amount: p.amount,
      currency: p.currency ?? undefined,
      status: p.opening_status,
      next_follow_up: p.next_follow_up ?? undefined,
      circumvention_ack_id: p.circumvention_ack_id,
    })
    .select()
    .single();
  if (error || !deal) {
    if (error?.code === "23505") return NextResponse.json({ error: "A deal with this partner already exists." }, { status: 409 });
    return NextResponse.json({ error: "Failed to create the deal" }, { status: 500 });
  }

  await admin.from("deal_proposals").update({ status: "accepted", resolved_at: new Date().toISOString() }).eq("id", id!);

  // Seed the timeline the way a direct create would have: the proposer's
  // opening note (their words, attributed to them), then the terms that were
  // accepted, then the acceptance itself. The terms line matters because
  // equity, valuation and conditions live on the proposal -- without it the
  // deal would carry an amount and nothing else about what was agreed.
  if (p.note) {
    await admin.from("deal_activity").insert({
      deal_id: deal.id, startup_id: p.startup_id, investor_id: p.investor_id,
      actor_id: p.proposed_by, type: "note", body: p.note,
    }).then(undefined, () => {});
  }
  const agreed = describeTerms(p);
  if (agreed) {
    await admin.from("deal_activity").insert({
      deal_id: deal.id, startup_id: p.startup_id, investor_id: p.investor_id,
      actor_id: user.id, type: "note", body: agreed,
    }).then(undefined, () => {});
  }
  await admin.from("deal_activity").insert({
    deal_id: deal.id, startup_id: p.startup_id, investor_id: p.investor_id,
    actor_id: user.id, type: "status_change", body: null,
  }).then(undefined, () => {});

  await notifyResolution(admin, p, user.id, true, deal.id);

  return NextResponse.json({ success: true, status: "accepted", deal });
}

/**
 * Take the answered proposal out of 'pending'.
 *
 * `.eq("status", "pending")` makes this a compare-and-set: if the other side
 * accepted a second ago, it matches nothing and the caller says so instead of
 * quietly forking the negotiation in two.
 *
 * 'countered' is the honest state and the one lib/contact-policy reads.
 * Migration 091's CHECK predated the value and 118 did not widen it; 122 did,
 * and production now permits pending, accepted, declined, withdrawn and
 * countered. The 'declined' fallback below is therefore no longer expected to
 * fire and is kept only for a database that has not had 122 applied: it is
 * true as far as it goes (this offer was not taken) and counters_id still
 * carries the real story. Delete it once no such database is left.
 */
async function closeAsCountered(admin: Admin, id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const first = await admin
    .from("deal_proposals")
    .update({ status: "countered", resolved_at: now })
    .eq("id", id).eq("status", "pending")
    .select("id").maybeSingle();
  if (!first.error) return !!first.data;

  const fallback = await admin
    .from("deal_proposals")
    .update({ status: "declined", resolved_at: now })
    .eq("id", id).eq("status", "pending")
    .select("id").maybeSingle();
  return !fallback.error && !!fallback.data;
}

/** Tells the side an offer or a counter has just landed on. */
async function notifyOffer(
  admin: Admin,
  o: {
    startupId: string; investorId: string; fromSide: "startup" | "investor";
    actorId: string; amount: number | null; currency: string; isCounter: boolean;
  },
) {
  try {
    const [{ data: st }, { data: inv }] = await Promise.all([
      admin.from("startups").select("name, owner_id").eq("id", o.startupId).maybeSingle(),
      admin.from("investors").select("display_name, firm_name, owner_id").eq("id", o.investorId).maybeSingle(),
    ]);
    const recipient = o.fromSide === "investor" ? st?.owner_id : inv?.owner_id;
    if (!recipient || recipient === o.actorId) return;
    const senderName = o.fromSide === "investor"
      ? (inv?.firm_name || inv?.display_name || "An investor")
      : (st?.name || "A startup");
    const money = o.amount != null ? formatMoney(o.amount, o.currency) : "";
    await notifyUser({
      userId: recipient,
      type: "deal_opened",
      title: o.isCounter ? `${senderName} countered: ${money}` : `${senderName} made an offer: ${money}`,
      body: o.isCounter
        ? "Accept it, decline it, or answer with another number."
        : "Accepting opens the conversation. You can also counter.",
      titleKey: o.isCounter ? "notif.offerCounterTitle" : "notif.offerTitle",
      bodyKey: o.isCounter ? "notif.offerCounterBody" : "notif.offerBody",
      params: { name: senderName, amount: money },
      href: "/deals",
    });
  } catch { /* a lost notification must not fail the action */ }
}

/** Tells the proposer how it went. A request that vanishes teaches people not to send the next one. */
async function notifyResolution(
  admin: Admin,
  p: { startup_id: string; investor_id: string; from_side: string; proposed_by: string },
  actorId: string,
  accepted: boolean,
  dealId?: string,
) {
  try {
    const [{ data: st }, { data: inv }] = await Promise.all([
      admin.from("startups").select("name").eq("id", p.startup_id).maybeSingle(),
      admin.from("investors").select("display_name, firm_name").eq("id", p.investor_id).maybeSingle(),
    ]);
    const accepterName = p.from_side === "investor"
      ? (st?.name ?? "The startup")
      : (inv?.firm_name || inv?.display_name || "The investor");
    if (p.proposed_by === actorId) return;
    await notifyUser({
      userId: p.proposed_by,
      type: accepted ? "deal_opened" : "deal_passed",
      title: accepted ? `${accepterName} accepted — the deal is open` : `${accepterName} declined your request`,
      body: accepted ? "It is on both pipelines now." : "No hard feelings — they may not be a fit right now.",
      href: accepted && dealId ? `/deals?deal=${dealId}` : "/deals",
    });
  } catch { /* a lost notification must not fail the action */ }
}
