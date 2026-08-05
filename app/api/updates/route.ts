import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resolveEntity } from "@/lib/membership";
import { isUuid } from "@/lib/utils";

/**
 * Investor updates (migration 035): the founder's periodic post. POST
 * creates and broadcasts to every saver (same fan-out as milestones);
 * DELETE removes one. Reads happen straight from the profile page via RLS.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, body } = await req.json().catch(() => ({}));
  if (typeof title !== "string" || !title.trim() || title.length > 150) {
    return NextResponse.json({ error: "title required (max 150 chars)" }, { status: 400 });
  }
  if (typeof body !== "string" || !body.trim() || body.length > 5000) {
    return NextResponse.json({ error: "body required (max 5000 chars)" }, { status: 400 });
  }

  const membership = await resolveEntity(user.id, "startup");
  if (!membership) return NextResponse.json({ error: "No startup" }, { status: 403 });

  const admin = createAdminClient();
  const { data: update, error } = await admin
    .from("startup_updates")
    .insert({ startup_id: membership.entityId, title: title.trim(), body: body.trim() })
    .select()
    .single();
  if (error || !update) {
    console.error("update insert failed:", error);
    return NextResponse.json({ error: "Could not post update" }, { status: 500 });
  }

  // Broadcast to savers -- awaited (serverless), best-effort, active only.
  try {
    const { data: startup } = await admin
      .from("startups").select("name, slug, status").eq("id", membership.entityId).maybeSingle();
    if (startup && startup.status === "active") {
      const { data: savers } = await admin
        .from("watchlists")
        .select("investor:investors(owner_id)")
        .eq("startup_id", membership.entityId)
        .limit(500);
      const userIds = Array.from(new Set(
        (savers ?? []).map((r: any) => r.investor?.owner_id)
          .filter((id: unknown): id is string => typeof id === "string" && id !== user.id),
      ));
      if (userIds.length > 0) {
        await admin.from("notifications").insert(userIds.map((uid) => ({
          user_id: uid,
          type: "listing_update",
          title: `${startup.name}: ${title.trim().slice(0, 120)}`,
          body: body.trim().slice(0, 140),
          href: `/startups/${startup.slug}`,
        })));
      }
    }
  } catch (e) {
    console.error("update broadcast failed:", e);
  }

  return NextResponse.json({ update });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  const membership = await resolveEntity(user.id, "startup");
  if (!membership) return NextResponse.json({ error: "No startup" }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("startup_updates").delete().eq("id", id).eq("startup_id", membership.entityId);
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
