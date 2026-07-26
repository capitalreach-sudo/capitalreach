import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { sendProfileUnderReviewEmail } from "@/lib/resend";

export async function POST(req: NextRequest) {
  // This route had no auth at all. Anyone who could guess a startup id could
  // POST here repeatedly and use it as a mailer aimed at that startup's owner,
  // and fire the internal webhook while they were at it. It is called from the
  // startup onboarding flow, so require a session and require the caller to own
  // the startup being announced (admins may announce any).
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId } = await req.json();
  if (typeof startupId !== "string" || !startupId) {
    return NextResponse.json({ error: "startupId required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: startup } = await adminClient
    .from("startups")
    .select("name, owner_id, owner:profiles(email, full_name)")
    .eq("id", startupId)
    .single();

  if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (startup.owner_id !== user.id) {
    const { data: me } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (me?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const ownerEmail = (startup.owner as any)?.email;
  if (ownerEmail) {
    await sendProfileUnderReviewEmail(ownerEmail, startup.name).catch(() => {});
  }

  // Also send a Slack/internal notification (optional — add webhook URL to env)
  if (process.env.ADMIN_NOTIFICATION_WEBHOOK) {
    await fetch(process.env.ADMIN_NOTIFICATION_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🆕 New startup submitted for review: *${startup.name}* — <${process.env.NEXT_PUBLIC_APP_URL}/admin|Review in Admin>`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
