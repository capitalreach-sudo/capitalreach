import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { sendListingRejectedEmail } from "@/lib/resend";
import { notifyUser } from "@/lib/notify-user";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { startupId, reason } = await req.json().catch(() => ({}));
  if (!reason) return NextResponse.json({ error: "Rejection reason required" }, { status: 400 });

  const adminClient = createAdminClient();

  const { data: startup } = await adminClient
    .from("startups")
    .select("name, slug, owner_id, owner:profiles(email)")
    .eq("id", startupId)
    .single();

  if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await adminClient
    .from("startups")
    .update({ status: "draft" })
    .eq("id", startupId);

  await adminClient.from("admin_actions").insert({
    admin_id: user.id,
    target_id: startupId,
    target_type: "startup",
    action: "reject",
    note: reason,
  });

  // A rejection with no reason reaching the founder is the worst version of
  // this: they see the listing is not live and have nothing to act on. The
  // reason travels with the notification.
  if (startup.owner_id) {
    await notifyUser({
      userId: startup.owner_id,
      type:   "listing_rejected",
      title:  `${startup.name} needs changes before it can go live`,
      body:   reason,
      href:   "/dashboard/startup",
    });
  }

  const ownerEmail = startup.owner?.email;
  if (ownerEmail) {
    await sendListingRejectedEmail(ownerEmail, startup.name, reason).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
