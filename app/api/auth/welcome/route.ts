import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/resend";
import { getLaunchStatus, incrementMemberCount } from "@/lib/launchMode";

/**
 * Post-signup hooks: the founding-member count, the invite the account arrived
 * with, and the welcome mail.
 *
 * Called on the first authenticated load rather than at signup, because with
 * email confirmation on there is no session at signup and every one of these
 * needs one. That means the route can be reached repeatedly -- a second tab, a
 * re-visit to onboarding, a re-mount -- so each effect has to happen exactly
 * once per member.
 */

/** Roughly how long after joining an account still counts as a fresh signup.
 *  Wide because confirmation happens whenever the mail is opened, which can be
 *  the next day; the claim below is what actually stops a second run. */
const FRESH_SIGNUP_MS = 24 * 60 * 60 * 1000;
const WELCOME_LOG_TYPE = "signup_welcome";

/**
 * Claim the one-and-only welcome for this user, using email_logs as the
 * ledger. Insert, then confirm ours is the oldest row of this type for the
 * user: two mounts racing both see an empty table, and a plain read-then-write
 * would mail twice. Same compare-and-claim the member counter uses, and the
 * losing row stays as an honest record of the attempt.
 */
async function claimWelcome(userId: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data: already } = await admin
    .from("email_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("type", WELCOME_LOG_TYPE)
    .limit(1)
    .maybeSingle();
  if (already) return null;

  const { data: mine } = await admin
    .from("email_logs")
    .insert({ user_id: userId, type: WELCOME_LOG_TYPE, status: "claimed" })
    .select("id")
    .maybeSingle();
  if (!mine) return null;

  const { data: first } = await admin
    .from("email_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("type", WELCOME_LOG_TYPE)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  return first?.id === mine.id ? mine.id : null;
}

/**
 * Marks an invite used and records who brought this member.
 *
 * The update is conditional on the invite still being unclaimed, so two
 * people opening the same link cannot both be attributed to it — the second
 * update matches no rows and quietly does nothing, which is the correct
 * outcome for whoever was second.
 *
 * Never throws: a failed attribution must not break a signup.
 */
async function redeemInvite(userId: string, code: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: claimed } = await admin
      .from("invites")
      .update({ accepted_by: userId, accepted_at: new Date().toISOString() })
      .eq("code", code)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("id, inviter_id")
      .maybeSingle();
    if (!claimed) return;

    await admin.from("profiles")
      .update({ invited_by: claimed.inviter_id, invite_code: code })
      .eq("id", userId);

    const { notifyUser } = await import("@/lib/notify-user");
    await notifyUser({
      userId: claimed.inviter_id,
      type: "team_added",
      title: "Someone you invited just joined",
      body: "Your invite was used.",
      href: "/dashboard",
    });
  } catch (err) {
    console.error("[auth/welcome] invite redemption failed:", err);
  }
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role, created_at")
      .eq("id", user.id)
      .single();

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Members who joined long ago reach this route too, now that it fires on
    // an authenticated load. Without this gate the next visit to onboarding
    // would mail the whole existing membership and inflate the founding count.
    // The confirmation timestamp is the accurate signal -- the profile row is
    // written by the signup trigger, hours before the mail may be opened --
    // and the profile age covers accounts that never had to confirm.
    const now = Date.now();
    const confirmedAt = user.email_confirmed_at ?? user.confirmed_at ?? null;
    const fresh =
      (!!confirmedAt && now - new Date(confirmedAt).getTime() < FRESH_SIGNUP_MS) ||
      (!!profile.created_at && now - new Date(profile.created_at).getTime() < FRESH_SIGNUP_MS);
    if (!fresh) return NextResponse.json({ success: true, skipped: "not-a-new-signup" });

    // F: redeem the invite the account arrived with. Done here rather than at
    // signup because the profile row is created by a trigger, and an invite
    // must only count once the account actually exists. Outside the claim
    // below because it carries its own once-only guard (the conditional
    // update), and losing the attribution to a lost claim would be worse.
    const inviteCode = (user.user_metadata?.invite_code as string | undefined)?.toUpperCase();
    if (inviteCode) await redeemInvite(user.id, inviteCode);

    const claimId = await claimWelcome(user.id);
    if (!claimId) return NextResponse.json({ success: true, skipped: "already-welcomed" });

    const { isLaunch } = await getLaunchStatus();
    if (isLaunch) await incrementMemberCount().catch(() => {});

    // The claim row stays whether or not the send works, so a bounced provider
    // cannot turn into a second welcome on the next page load. Its status is
    // the only place that difference is recorded.
    try {
      await sendWelcomeEmail(user.email!, profile.full_name || "", profile.role);
    } catch (err) {
      await createAdminClient().from("email_logs").update({ status: "failed" }).eq("id", claimId);
      throw err;
    }
    await createAdminClient().from("email_logs").update({ status: "sent" }).eq("id", claimId);
    return NextResponse.json({ success: true });
  } catch {
    // Non-critical — don't surface email failures to the user
    return NextResponse.json({ success: true });
  }
}
