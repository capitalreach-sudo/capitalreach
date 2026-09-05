import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * The waitlist on a round that is not taking money right now (migration 092).
 *
 * Joining is only possible when the round is actually closed to new interest
 * — closed or oversubscribed. On an open round the correct action is a deal
 * request, and offering both buttons at once teaches people to take the
 * noncommittal one.
 *
 * The founder is told someone joined (identity plan-gated, same rule as
 * savers and viewers), because "three investors are waiting on your full
 * round" is exactly the fact that prices the next one.
 *
 * POST   { startupId, note? } — join
 * DELETE ?startupId=          — leave
 * GET    ?startupId=          — my status + count (public count, not names)
 */

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const startupId = req.nextUrl.searchParams.get("startupId") ?? "";
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const admin = createAdminClient();
  const { count } = await admin
    .from("round_waitlist").select("id", { count: "exact", head: true })
    .eq("startup_id", startupId);

  let joined = false;
  if (user) {
    const mine = await resolveEntity(user.id, "investor");
    if (mine) {
      const { data } = await admin
        .from("round_waitlist").select("id")
        .eq("startup_id", startupId).eq("investor_id", mine.entityId).maybeSingle();
      joined = !!data;
    }
  }
  return NextResponse.json({ count: count ?? 0, joined });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const { startupId, note } = await req.json().catch(() => ({}));
  if (!isUuid(startupId ?? "")) return NextResponse.json({ error: "startupId required" }, { status: 400 });
  const text = typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null;

  const mine = await resolveEntity(user.id, "investor");
  if (!mine) return NextResponse.json({ error: "Only investors can join a waitlist." }, { status: 403 });

  const admin = createAdminClient();
  const { data: st } = await admin
    .from("startups").select("id, name, owner_id, status, round_state").eq("id", startupId).maybeSingle();
  if (!st || st.status !== "active") return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (st.round_state !== "closed" && st.round_state !== "oversubscribed") {
    return NextResponse.json({ error: "This round is open — request a deal instead." }, { status: 409 });
  }

  const { error } = await admin
    .from("round_waitlist")
    .upsert({ startup_id: startupId, investor_id: mine.entityId, note: text }, { onConflict: "startup_id,investor_id" });
  if (error) return NextResponse.json({ error: "Could not join" }, { status: 500 });

  await notifyUser({
    userId: st.owner_id,
    type: "listing_saved",
    title: `An investor joined your waitlist`,
    body: st.round_state === "oversubscribed"
      ? "They want in if space opens up."
      : "They want to hear when you raise again.",
    titleKey: "notif.waitlistTitle",
    bodyKey: st.round_state === "oversubscribed" ? "notif.waitlistBodyOversub" : "notif.waitlistBodyClosed",
    href: "/dashboard/startup",
  }).catch(() => {});

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startupId = req.nextUrl.searchParams.get("startupId") ?? "";
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const mine = await resolveEntity(user.id, "investor");
  if (!mine) return NextResponse.json({ success: true });

  await createAdminClient()
    .from("round_waitlist").delete()
    .eq("startup_id", startupId).eq("investor_id", mine.entityId);
  return NextResponse.json({ success: true });
}
