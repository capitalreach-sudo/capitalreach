import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/resend";
import { getLaunchStatus, incrementMemberCount } from "@/lib/launchMode";

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

    // Increment launch member count if this is a fresh signup (within 5 min)
    const { isLaunch } = await getLaunchStatus();
    if (isLaunch && profile.created_at) {
      const ageMs = Date.now() - new Date(profile.created_at).getTime();
      if (ageMs < 5 * 60 * 1000) {
        await incrementMemberCount().catch(() => {});
      }
    }

    // F: redeem the invite the account arrived with. Done here rather than at
    // signup because the profile row is created by a trigger, and an invite
    // must only count once the account actually exists.
    const inviteCode = (user.user_metadata?.invite_code as string | undefined)?.toUpperCase();
    if (inviteCode) await redeemInvite(user.id, inviteCode);

    await sendWelcomeEmail(user.email!, profile.full_name || "", profile.role);
    return NextResponse.json({ success: true });
  } catch {
    // Non-critical — don't surface email failures to the user
    return NextResponse.json({ success: true });
  }
}
