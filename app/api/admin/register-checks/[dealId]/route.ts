import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction, atLeast } from "@/lib/admin-guard";
import { createSuccessFeeInvoice } from "@/lib/stripe";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";
import { SUCCESS_FEE_PERCENT } from "@/lib/circumvention-text";
import {
  isRegisterVerdict,
  registerDifference,
  supplementaryFeeOn,
  type RegisterVerdict,
} from "@/lib/register-check";

/**
 * One reviewer, one register check, recorded.
 *
 * What this route does NOT do is the point of it. It compares nothing, decides
 * nothing and triggers nothing on a timer. A filed figure that differs from a
 * declared one is not evidence of anything on its own: rounds close in
 * tranches and get filed as one entry, a filing basis can be share capital
 * rather than money received, a convertible converts at a different number
 * months later, and a register can simply be behind. So the verdict is
 * whatever the admin read with both figures in front of them, and the two
 * consequences -- a supplementary fee, a strike on a record -- are separate
 * opt-ins on top of it, each requiring owner level.
 *
 * Nothing here suspends an account, and nothing here should ever learn to.
 * Suspending somebody on an automated comparison against a foreign company
 * register is a liability nobody on this side has accepted; the strike is
 * counted and surfaced, and what it costs stays a decision a person takes
 * knowing the whole file.
 *
 * The verdict columns carry the 125 guard trigger, so they can only be written
 * by the service role -- which is to say only from behind this admin check.
 * The party being checked cannot mark their own round matched.
 */

/** Same ceiling the close route puts on a caller-supplied figure: this one
 *  drives a real invoice against a founder. */
const MAX_AMOUNT = 1_000_000_000_000;
const NOTE_MAX = 1000;

// One unbroken literal. supabase-js infers the row shape from the TEXT of this
// string, so splitting it with + widens the type to `string` and every field
// comes back as GenericStringError instead of its real type.
const DEAL_COLUMNS =
  "id, status, amount, currency, closed_at, success_fee_amount, register_check_due, register_check_status, register_filed_amount, startup:startups(id, name, owner_id, legal_entity_name, register_type, register_number), investor:investors(id, display_name, owner_id)";

type StartupJoin = {
  id: string;
  name: string | null;
  owner_id: string | null;
  legal_entity_name: string | null;
  register_type: string | null;
  register_number: string | null;
} | null;

type InvestorJoin = { id: string; display_name: string | null; owner_id: string | null } | null;

export async function POST(req: NextRequest, { params }: { params: { dealId: string } }) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const dealId = params.dealId;
  if (!isUuid(dealId)) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const verdict = body?.status as RegisterVerdict;
  const noteRaw = typeof body?.note === "string" ? body.note.trim() : "";
  const note = noteRaw.slice(0, NOTE_MAX);
  const wantsInvoice = body?.supplementaryInvoice === true;
  const strikeSide = body?.strike === "startup" || body?.strike === "investor" ? body.strike : null;

  if (!isRegisterVerdict(verdict)) {
    return NextResponse.json({ error: "status must be matched, discrepancy or no_filing_found" }, { status: 400 });
  }

  // A filed figure is the whole substance of the first two verdicts; without
  // it "matched" is an assertion with nothing behind it.
  let filedAmount: number | null = null;
  if (verdict === "matched" || verdict === "discrepancy") {
    const n = typeof body?.filedAmount === "number" ? body.filedAmount : Number(body?.filedAmount);
    if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
      return NextResponse.json({ error: "Record the amount the register shows." }, { status: 400 });
    }
    filedAmount = n;
  }

  // A difference the reviewer accepted as honest still gets written down, so
  // the note is required wherever the figures disagree.
  if (verdict === "discrepancy" && !note) {
    return NextResponse.json({ error: "A discrepancy needs a note saying what the difference is." }, { status: 400 });
  }

  const { data: deal, error: dealError } = await admin
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("id", dealId)
    .maybeSingle();

  // "Not found" is a fact about the ledger, so a failed read must not borrow
  // it -- an operator acts on that answer by going looking elsewhere.
  if (dealError) {
    console.error("[admin/register-checks:read]", dealError);
    return NextResponse.json({ error: "Could not read the deal" }, { status: 500 });
  }
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  if (deal.status !== "closed") {
    return NextResponse.json({ error: "Only a closed round can be checked against a register." }, { status: 409 });
  }
  if (deal.register_check_status === "not_due") {
    return NextResponse.json(
      { error: "This company has no register entity on file, so there is nothing to check it against." },
      { status: 409 },
    );
  }

  const startup = deal.startup as unknown as StartupJoin;
  const investor = deal.investor as unknown as InvestorJoin;
  const declaredAmount = deal.amount === null ? null : Number(deal.amount);
  const currency = deal.currency ?? "USD";
  const difference = registerDifference(filedAmount, declaredAmount);

  // ── The two consequences ────────────────────────────────────────────────
  // Recording what a register says is operator work. Billing somebody on the
  // strength of it, or marking their record, is not.
  if ((wantsInvoice || strikeSide) && !atLeast(guard.level, "owner")) {
    return NextResponse.json(
      {
        error: "A supplementary fee and a strike need an owner-level admin.",
        requiresOwner: true,
      },
      { status: 403 },
    );
  }
  if ((wantsInvoice || strikeSide) && verdict !== "discrepancy") {
    return NextResponse.json({ error: "Those only follow a recorded discrepancy." }, { status: 409 });
  }
  if (wantsInvoice && (difference === null || difference <= 0)) {
    return NextResponse.json(
      { error: "A supplementary fee needs a filed figure above the declared one." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();

  // The verdict is written first and on its own. Whatever happens to an
  // invoice or a strike below, what the register said is the finding, and
  // losing it because Stripe was down would mean reading the register again.
  const { error: updateError } = await admin
    .from("deals")
    .update({
      register_check_status: verdict,
      register_filed_amount: filedAmount,
    })
    .eq("id", dealId);

  if (updateError) {
    console.error("[admin/register-checks:write]", updateError);
    return NextResponse.json({ error: "Could not record the check" }, { status: 500 });
  }

  await logAdminAction(admin, guard.adminId, `register_check_${verdict}`, "startup", startup?.id ?? null, {
    dealId,
    declared_amount: declaredAmount,
    filed_amount: filedAmount,
    difference,
    currency,
    register_type: startup?.register_type ?? null,
    register_number: startup?.register_number ?? null,
    legal_entity_name: startup?.legal_entity_name ?? null,
    checked_at: now,
    note: note || null,
  });

  // ── The supplementary fee ───────────────────────────────────────────────
  // Billed on the DIFFERENCE, not on the filed total: the fee on the declared
  // amount was already raised at close, and charging the whole filed figure
  // again would bill that slice twice. createSuccessFeeInvoice applies the
  // percentage itself, so the figure handed to it is capital, not fee.
  let invoice: { id: string; url: string } | null = null;
  let invoiceError: string | null = null;
  if (wantsInvoice && difference !== null && difference > 0) {
    const { data: ownerProfile, error: profileError } = await admin
      .from("profiles")
      .select("id, stripe_customer_id")
      .eq("id", startup?.owner_id ?? "")
      .maybeSingle();

    if (profileError) {
      console.error("[admin/register-checks:profile]", profileError);
      invoiceError = "Could not read the founder's billing account.";
    } else if (!ownerProfile?.stripe_customer_id) {
      invoiceError = "This founder has no billing account, so nothing can be raised against them.";
    } else {
      try {
        const created = await createSuccessFeeInvoice(
          ownerProfile.stripe_customer_id,
          difference,
          startup?.name ?? "Startup",
          currency,
          dealId,
        );
        invoice = { id: created.id, url: created.hosted_invoice_url || "" };

        // stripe_invoice_id still points at the close invoice and must keep
        // doing so: the paid webhook matches on it, and repointing it at this
        // one would leave the original payment matching nothing. This invoice
        // therefore lives in the admin log and on the deal timeline, and is
        // outside the dunning ledger.
        await logAdminAction(admin, guard.adminId, "register_check_supplementary_fee", "startup", startup?.id ?? null, {
          dealId,
          difference,
          currency,
          fee_percent: SUCCESS_FEE_PERCENT,
          invoice_id: created.id,
        });

        await admin.from("deal_activity").insert({
          deal_id: dealId,
          startup_id: startup?.id ?? null,
          investor_id: investor?.id ?? null,
          actor_id: guard.adminId,
          type: "success_fee",
          body: `${currency} ${supplementaryFeeOn(difference).toLocaleString()}`,
        }).then(undefined, () => {});

        if (startup?.owner_id) {
          await notifyUser({
            userId: startup.owner_id,
            type: "fee_due",
            title: "Supplementary success fee",
            body: `A fee has been raised on the difference between your closed round and the amount filed at your company register.`,
            href: "/dashboard/startup/billing",
          });
        }
      } catch (err) {
        console.error("[admin/register-checks:invoice]", err);
        invoiceError = "The invoice could not be raised. The check is recorded; try the fee again.";
      }
    }
  }

  // ── The strike ──────────────────────────────────────────────────────────
  // Counted and shown, never enforced. There is no automatic suspension here
  // and no threshold that trips one: a strike is a line in a record a person
  // reads, and what it costs is decided by a person who has read the rest of
  // the file. The struck member can read their own count (079), which is the
  // point -- a mark nobody can see is a mark nobody can dispute.
  let strike: { userId: string; count: number } | null = null;
  let strikeError: string | null = null;
  if (strikeSide) {
    const subjectId = strikeSide === "startup" ? startup?.owner_id : investor?.owner_id;
    if (!subjectId) {
      strikeError = "That side has no account on this platform to mark.";
    } else {
      const { data: subject, error: subjectError } = await admin
        .from("profiles")
        .select("id, circumvention_strikes")
        .eq("id", subjectId)
        .maybeSingle();

      if (subjectError || !subject) {
        if (subjectError) console.error("[admin/register-checks:strike-read]", subjectError);
        strikeError = "Could not read that account.";
      } else {
        const next = Number(subject.circumvention_strikes ?? 0) + 1;
        const { error: strikeWriteError } = await admin
          .from("profiles")
          .update({ circumvention_strikes: next })
          .eq("id", subjectId);

        if (strikeWriteError) {
          console.error("[admin/register-checks:strike-write]", strikeWriteError);
          strikeError = "Could not record the strike.";
        } else {
          strike = { userId: subjectId, count: next };
          await logAdminAction(admin, guard.adminId, "register_check_strike", "profile", subjectId, {
            dealId,
            side: strikeSide,
            strikes: next,
            difference,
            currency,
            note: note || null,
          });
          await notifyUser({
            userId: subjectId,
            type: "admin_alert",
            title: "A note was added to your record",
            body: note || "A closed round did not match what was filed at the company register.",
            href: "/dashboard",
          });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    status: verdict,
    filedAmount,
    declaredAmount,
    difference,
    invoice,
    invoiceError,
    strike,
    strikeError,
  });
}
