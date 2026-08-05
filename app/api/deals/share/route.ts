import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * Co-investor sharing: send a listing to another investor on the platform.
 * The recipient gets a deal_shared notification linking to the profile.
 * Only active listings can be shared, and only by investors.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId, toInvestorId, note } = await req.json().catch(() => ({}));
  if (!isUuid(startupId) || !isUuid(toInvestorId)) {
    return NextResponse.json({ error: "startupId and toInvestorId required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: me }, { data: to }, { data: startup }] = await Promise.all([
    admin.from("investors").select("id, display_name, firm_name").eq("owner_id", user.id).maybeSingle(),
    admin.from("investors").select("owner_id").eq("id", toInvestorId).maybeSingle(),
    admin.from("startups").select("name, slug, status").eq("id", startupId).maybeSingle(),
  ]);
  if (!me) return NextResponse.json({ error: "Investors only" }, { status: 403 });
  if (!to?.owner_id || !startup || startup.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (to.owner_id === user.id) return NextResponse.json({ error: "That's you" }, { status: 400 });

  await notifyUser({
    userId: to.owner_id,
    type: "deal_shared",
    title: `${me.display_name ?? me.firm_name ?? "An investor"} shared ${startup.name} with you`,
    body: typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null,
    href: `/startups/${startup.slug}`,
  });
  return NextResponse.json({ shared: true });
}
