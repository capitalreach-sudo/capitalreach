import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { sendProfileUnderReviewEmail } from "@/lib/resend";
import { resend } from "@/lib/resend";

export async function POST(req: NextRequest) {
  const { startupId } = await req.json();
  const adminClient = createAdminClient();

  const { data: startup } = await adminClient
    .from("startups")
    .select("name, owner:profiles(email, full_name)")
    .eq("id", startupId)
    .single();

  if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
