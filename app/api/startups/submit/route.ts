import { NextResponse } from "next/server";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { sendProfileUnderReviewEmail } from "@/lib/resend";

/**
 * The founder's own "submit for review".
 *
 * Rejection sets a listing back to 'draft', and until this route existed there
 * was NO transition from draft to pending_review anywhere: /api/startups/save
 * stamps pending_review only on INSERT, and the admin queue lists only
 * pending_review. So a rejected listing was stranded forever while three
 * pieces of copy promised a resubmit -- the founder edited, saved, saw
 * "Changes saved", and sat in draft for good. This is the queue re-entry.
 *
 * Owner-only, draft-only, service-role write (129 locks `status` to the
 * server), and the same under-review email + internal ping the first
 * submission sends, so the reviewer hears about round two the way they heard
 * about round one.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }
  { const rl = await dbRateLimit(user.id, "listing_submit", ...Object.values(RATE.perHour(5)) as [number, number]);
    if (!rl.ok) return NextResponse.json({ error: "Already submitted. The review team has it." }, { status: 429 }); }

  const admin = createAdminClient();
  const { data: startup } = await admin
    .from("startups")
    .select("id, name, status, owner:profiles(email)")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!startup) return NextResponse.json({ error: "No listing to submit." }, { status: 404 });
  if (startup.status === "pending_review") {
    return NextResponse.json({ submitted: true, already: true });
  }
  if (startup.status !== "draft") {
    // Active listings do not re-enter the queue; their edits ride the
    // edited_since_review flag. Suspended/rejected-terminal states are the
    // admin's to lift.
    return NextResponse.json({ error: "Only a draft can be submitted for review.", code: "not_a_draft" }, { status: 409 });
  }

  const { error } = await admin
    .from("startups")
    .update({ status: "pending_review", edited_since_review_at: null })
    .eq("id", startup.id)
    .eq("status", "draft");
  if (error) {
    console.error("[startups/submit]", error.message);
    return NextResponse.json({ error: "Could not submit right now." }, { status: 500 });
  }

  const ownerEmail = (startup.owner as { email?: string | null } | null)?.email;
  if (ownerEmail) await sendProfileUnderReviewEmail(ownerEmail, startup.name).catch(() => {});
  if (process.env.ADMIN_NOTIFICATION_WEBHOOK) {
    await fetch(process.env.ADMIN_NOTIFICATION_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        text: `🔁 Listing resubmitted for review: *${startup.name}* — <${process.env.NEXT_PUBLIC_APP_URL}/admin|Review in Admin>`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ submitted: true });
}
