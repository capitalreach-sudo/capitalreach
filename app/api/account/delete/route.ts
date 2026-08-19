import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { brand } from "@/lib/brand";
import { feeState, type FeeDeal } from "@/lib/fees";

// Omitted entirely when no support address is configured, rather than telling
// the user to "please contact " with nothing after it.
const supportSuffix = brand.support ? ` Please contact ${brand.support}.` : "";

/**
 * E49: leaving properly.
 *
 * This used to call auth.admin.deleteUser, which cascades. For a user who only
 * ever browsed, that is exactly right and it still happens. For a user who has
 * CLOSED A DEAL it destroyed the counterparty's record of a transaction they
 * were also party to, and erased a success fee the platform is owed — an
 * invoice cannot be deleted by the person who owes it.
 *
 * So deletion forks. Either the account is erased, or it stops being a person
 * and becomes a record: name, email, avatar, bio and links are scrubbed, the
 * listing comes down, and the deal rows survive with nothing personal left on
 * them. The user is told which happened and why before it happens, via GET.
 */

type Verdict = {
  mode: "erase" | "anonymise";
  reasons: string[];
  closedDeals: number;
  openFees: number;
};

async function assess(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<Verdict> {
  const [{ data: startup }, { data: investor }] = await Promise.all([
    admin.from("startups").select("id").eq("owner_id", userId).maybeSingle(),
    admin.from("investors").select("id").eq("owner_id", userId).maybeSingle(),
  ]);

  const filters: string[] = [];
  if (startup?.id) filters.push(`startup_id.eq.${startup.id}`);
  if (investor?.id) filters.push(`investor_id.eq.${investor.id}`);

  if (!filters.length) return { mode: "erase", reasons: [], closedDeals: 0, openFees: 0 };

  const { data: deals } = await admin
    .from("deals")
    .select("id, status, success_fee_amount, success_fee_invoiced, success_fee_paid_at, fee_billing_status, fee_waived_at, fee_disputed_at, fee_dispute_resolved_at, fee_refunded_at, fee_chargeback_at, fee_chargeback_resolved_at")
    .or(filters.join(","))
    .limit(1000);

  const closedDeals = (deals ?? []).filter(d => d.status === "closed").length;
  const openFees = (deals ?? []).filter(d => {
    const s = feeState(d as unknown as FeeDeal);
    return s === "outstanding" || s === "unbillable" || s === "disputed";
  }).length;

  const reasons: string[] = [];
  if (closedDeals > 0) reasons.push("closed_deals");
  if (openFees > 0) reasons.push("open_fees");

  return { mode: reasons.length ? "anonymise" : "erase", reasons, closedDeals, openFees };
}

/** What deleting would do, so the confirmation can say it before it happens. */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await assess(createAdminClient(), user.id));
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const { reason } = await req.json().catch(() => ({}));
  const why = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;

  try {
    // Cancel Stripe subscriptions either way. Nobody should keep being billed
    // for an account they have left.
    const { data: profile } = await adminClient
      .from("profiles")
      .select("stripe_customer_id, role")
      .eq("id", user.id)
      .single();

    if (profile?.stripe_customer_id) {
      try {
        const { stripe } = await import("@/lib/stripe");
        const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, limit: 10 });
        await Promise.all(
          subs.data
            .filter(s => s.status === "active" || s.status === "trialing")
            .map(s => stripe.subscriptions.cancel(s.id))
        );
      } catch {
        // Non-fatal — proceed even if Stripe fails.
      }
    }

    const verdict = await assess(adminClient, user.id);

    if (verdict.mode === "erase") {
      const { error } = await adminClient.auth.admin.deleteUser(user.id);
      if (error) {
        console.error("[account/delete] deleteUser error:", error);
        return NextResponse.json({ error: `Failed to delete account.${supportSuffix}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, mode: "erase" });
    }

    // ── Anonymise ──────────────────────────────────────────────────────────
    const now = new Date().toISOString();
    // The address has to stay unique and has to stop being deliverable. The
    // .invalid TLD is reserved by RFC 2606 precisely so it can never resolve.
    const scrubbedEmail = `deleted-${user.id}@deleted.invalid`;

    await adminClient.from("profiles").update({
      email: scrubbedEmail,
      full_name: "Deleted account",
      avatar_url: null,
      account_status: "deleted",
      deleted_at: now,
      anonymised_at: now,
      deletion_reason: why,
      suspended: true,
    }).eq("id", user.id);

    // The listing comes down. It is somebody's public page and there is no
    // longer a somebody.
    await adminClient.from("startups").update({ status: "archived" }).eq("owner_id", user.id);
    await adminClient.from("investors").update({ is_public: false, display_name: "Former member", bio: null, website: null, linkedin_url: null }).eq("owner_id", user.id);

    // The login must stop working. Deleting the auth user would cascade and
    // take the records with it, so the credentials are neutralised instead.
    await adminClient.auth.admin.updateUserById(user.id, {
      email: scrubbedEmail,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { deleted: true },
    });

    return NextResponse.json({ success: true, mode: "anonymise", reasons: verdict.reasons });
  } catch (err) {
    console.error("[account/delete]", err);
    return NextResponse.json({ error: `Deletion failed.${supportSuffix}` }, { status: 500 });
  }
}
