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

  const { title, body, audience: rawAudience } = await req.json().catch(() => ({}));
  // B21: who hears about it. watchers = savers (the old behaviour); deals =
  // every investor with a deal on this startup, closed ones included (an
  // update should reach the people who invested); all = both.
  const AUD = ["watchers", "deals", "all"] as const;
  const audience: typeof AUD[number] = AUD.includes(rawAudience) ? rawAudience : "watchers";
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
    .insert({ startup_id: membership.entityId, title: title.trim(), body: body.trim(), audience })
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
      const ids: string[] = [];
      if (audience === "watchers" || audience === "all") {
        const { data: savers } = await admin
          .from("watchlists")
          .select("investor:investors(owner_id)")
          .eq("startup_id", membership.entityId)
          .limit(500);
        for (const r of (savers ?? []) as any[]) if (r.investor?.owner_id) ids.push(r.investor.owner_id);
      }
      if (audience === "deals" || audience === "all") {
        const { data: dealInv } = await admin
          .from("deals")
          .select("status, investor:investors(owner_id)")
          .eq("startup_id", membership.entityId)
          .neq("status", "passed")
          .limit(500);
        for (const r of (dealInv ?? []) as any[]) if (r.investor?.owner_id) ids.push(r.investor.owner_id);
      }
      const userIds = Array.from(new Set(ids.filter((id) => id !== user.id)));
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

/** GET — the founder's own update history (B21). */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await resolveEntity(user.id, "startup");
  if (!membership) return NextResponse.json({ updates: [] });
  const admin = createAdminClient();
  const { data } = await admin
    .from("startup_updates")
    .select("id, title, body, audience, created_at, updated_at")
    .eq("startup_id", membership.entityId)
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ updates: data ?? [] });
}

/** PATCH { id, title?, body? } — edit a posted update (B21). No re-broadcast. */
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, title, body } = await req.json().catch(() => ({}));
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: { title?: string; body?: string; updated_at: string } = { updated_at: new Date().toISOString() };
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.length > 150) return NextResponse.json({ error: "title max 150 chars" }, { status: 400 });
    patch.title = title.trim();
  }
  if (body !== undefined) {
    if (typeof body !== "string" || !body.trim() || body.length > 5000) return NextResponse.json({ error: "body max 5000 chars" }, { status: 400 });
    patch.body = body.trim();
  }
  const membership = await resolveEntity(user.id, "startup");
  if (!membership) return NextResponse.json({ error: "No startup" }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("startup_updates").update(patch).eq("id", id).eq("startup_id", membership.entityId).select("id, title, body, audience, created_at, updated_at").single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ update: data });
}
