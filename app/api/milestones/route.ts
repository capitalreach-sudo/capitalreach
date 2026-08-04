import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resolveEntity } from "@/lib/membership";
import { isUuid } from "@/lib/utils";

/**
 * Milestones after onboarding.
 *
 * Onboarding could create milestones; nothing could since -- the dashboard
 * checklist literally asks founders to "Add at least one milestone" with no
 * control anywhere that does it. POST adds one, DELETE removes one, both for
 * the startup the caller owns or is a team member of (resolveEntity).
 *
 * Adding a milestone also notifies every investor who saved the startup
 * (type listing_update, migration 030): a watchlist that never hears back is
 * a pile, and this is the feed that makes saving worth doing. One bulk
 * insert, awaited -- Vercel kills detached promises -- and best-effort: a
 * broadcast failure never fails the milestone.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { date, description } = await req.json().catch(() => ({}));
  if (typeof description !== "string" || !description.trim() || description.length > 500) {
    return NextResponse.json({ error: "description required (max 500 chars)" }, { status: 400 });
  }
  if (typeof date !== "string" || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: "date required (ISO)" }, { status: 400 });
  }

  const membership = await resolveEntity(user.id, "startup");
  if (!membership) return NextResponse.json({ error: "No startup" }, { status: 403 });

  const admin = createAdminClient();
  const { data: milestone, error } = await admin
    .from("startup_milestones")
    .insert({ startup_id: membership.entityId, date, description: description.trim() })
    .select()
    .single();

  if (error || !milestone) {
    console.error("milestone insert failed:", error);
    return NextResponse.json({ error: "Could not add milestone" }, { status: 500 });
  }

  try {
    const { data: startup } = await admin
      .from("startups")
      .select("name, slug, status")
      .eq("id", membership.entityId)
      .maybeSingle();

    // Draft/pending listings broadcast nothing -- savers can only exist for
    // listings that were public, but status can regress (suspension, edits
    // pending re-review) and a hidden listing should stay quiet.
    if (startup && startup.status === "active") {
      const { data: savers } = await admin
        .from("watchlists")
        .select("investor:investors(owner_id)")
        .eq("startup_id", membership.entityId)
        .limit(500);

      const userIds = Array.from(new Set(
        (savers ?? [])
          .map((r: any) => r.investor?.owner_id)
          .filter((id: unknown): id is string => typeof id === "string" && id !== user.id),
      ));

      if (userIds.length > 0) {
        await admin.from("notifications").insert(userIds.map((uid) => ({
          user_id: uid,
          type: "listing_update",
          title: `${startup.name} posted an update`,
          body: description.trim().slice(0, 140),
          href: `/startups/${startup.slug}`,
        })));
      }
    }
  } catch (e) {
    console.error("listing_update broadcast failed:", e);
  }

  return NextResponse.json({ milestone });
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
  // Scoped by startup_id as well as id, so a milestone of someone else's
  // startup is unreachable no matter what id is sent.
  const { error } = await admin
    .from("startup_milestones")
    .delete()
    .eq("id", id)
    .eq("startup_id", membership.entityId);

  if (error) {
    console.error("milestone delete failed:", error);
    return NextResponse.json({ error: "Could not remove milestone" }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
