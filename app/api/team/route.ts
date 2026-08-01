import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity, canManageTeam } from "@/lib/membership";
import type { EntityType } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";

/**
 * Team roster for the caller's startup or investor entity.
 *
 * GET    lists members (anyone on the team)
 * POST   invites by email  (owner/admin only)
 * DELETE removes a member  (owner/admin only)
 *
 * All writes go through the service role, because team_members deliberately has
 * no INSERT policy for `authenticated` -- a member who can add members can
 * promote themselves, so the check lives here where role can be enforced.
 */

function parseType(v: unknown): EntityType | null {
  return v === "startup" || v === "investor" ? v : null;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = parseType(req.nextUrl.searchParams.get("type"));
  if (!type) return NextResponse.json({ error: "type must be startup or investor" }, { status: 400 });

  const me = await resolveEntity(user.id, type);
  if (!me) return NextResponse.json({ members: [], entityId: null, myRole: null });

  const admin = createAdminClient();
  const table = type === "startup" ? "startups" : "investors";

  const [{ data: entity }, { data: rows }] = await Promise.all([
    admin.from(table).select("owner_id").eq("id", me.entityId).maybeSingle(),
    admin
      .from("team_members")
      .select("id, user_id, role, created_at, profile:profiles(full_name, email)")
      .eq("entity_type", type)
      .eq("entity_id", me.entityId)
      .order("created_at", { ascending: true }),
  ]);

  // The owner isn't a team_members row -- ownership lives on the entity -- so
  // they'd be missing from their own roster without this.
  const { data: ownerProfile } = entity?.owner_id
    ? await admin.from("profiles").select("full_name, email").eq("id", entity.owner_id).maybeSingle()
    : { data: null };

  const members = [
    ...(ownerProfile
      ? [{
          id: null,
          userId: entity!.owner_id,
          role: "owner" as const,
          name: ownerProfile.full_name,
          email: ownerProfile.email,
          canRemove: false,
        }]
      : []),
    ...(rows ?? []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      role: r.role,
      name: r.profile?.full_name ?? null,
      email: r.profile?.email ?? null,
      canRemove: true,
    })),
  ];

  return NextResponse.json({ members, entityId: me.entityId, myRole: me.role });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const { type: rawType, email, role } = await req.json();
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "type must be startup or investor" }, { status: 400 });
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  const memberRole = role === "admin" ? "admin" : "member";

  const me = await resolveEntity(user.id, type);
  if (!me) return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
  if (!(await canManageTeam(user.id, type, me.entityId))) {
    return NextResponse.json({ error: "Only owners and admins can change the team" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Only existing accounts can be added. Inviting a stranger by email would
  // mean sending mail, which does not work on this deployment yet -- so rather
  // than silently creating an invite nobody ever hears about, say so.
  const { data: invitee } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (!invitee) {
    return NextResponse.json(
      { error: "No CapitalReach account with that email. Ask them to sign up first." },
      { status: 404 }
    );
  }

  const { data: entity } = await admin
    .from(type === "startup" ? "startups" : "investors")
    .select("owner_id")
    .eq("id", me.entityId)
    .maybeSingle();

  if (entity?.owner_id === invitee.id) {
    return NextResponse.json({ error: "That person already owns this account" }, { status: 409 });
  }

  const { error } = await admin
    .from("team_members")
    .upsert(
      { entity_type: type, entity_id: me.entityId, user_id: invitee.id, role: memberRole, invited_by: user.id },
      { onConflict: "entity_type,entity_id,user_id" }
    );

  if (error) {
    console.error("[team]", error);
    return NextResponse.json({ error: "Could not add that member" }, { status: 500 });
  }

  await notifyUser({
    userId: invitee.id,
    type:   "deal_opened",   // closest existing type; 022's CHECK doesn't allow a team one
    title:  "You were added to a team on CapitalReach",
    body:   `You now have access to a ${type === "startup" ? "startup" : "investor"} account.`,
    href:   type === "startup" ? "/dashboard/startup" : "/dashboard/investor",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type: rawType, memberId } = await req.json();
  const type = parseType(rawType);
  if (!type || typeof memberId !== "string" || !memberId) {
    return NextResponse.json({ error: "type and memberId are required" }, { status: 400 });
  }

  const me = await resolveEntity(user.id, type);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canManageTeam(user.id, type, me.entityId))) {
    return NextResponse.json({ error: "Only owners and admins can change the team" }, { status: 403 });
  }

  // Scoped by entity as well as id: a manager of one team must not be able to
  // delete a membership row belonging to another.
  const admin = createAdminClient();
  const { error } = await admin
    .from("team_members")
    .delete()
    .eq("id", memberId)
    .eq("entity_type", type)
    .eq("entity_id", me.entityId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
