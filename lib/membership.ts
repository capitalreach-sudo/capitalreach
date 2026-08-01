import { createAdminClient } from "@/lib/supabase-server";

export type EntityType = "startup" | "investor";
export type TeamRole = "admin" | "member";

export interface Membership {
  entityId: string;
  /** "owner" is not stored -- it is derived from entities.owner_id. */
  role: TeamRole | "owner";
}

/**
 * Which startup / investor does this user act on behalf of?
 *
 * Everything in this codebase resolves an entity with
 * `.eq("owner_id", user.id)`, which is why one login per company has been the
 * ceiling. This resolves through ownership *first* and team membership second,
 * so an associate at a fund lands on the fund's pipeline rather than an empty
 * dashboard.
 *
 * Ownership is checked first deliberately: someone who both owns one entity and
 * is a member of another should get their own, not whichever row sorts first.
 */
export async function resolveEntity(
  userId: string,
  type: EntityType
): Promise<Membership | null> {
  const admin = createAdminClient();
  const table = type === "startup" ? "startups" : "investors";

  const { data: owned } = await admin
    .from(table)
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (owned) return { entityId: owned.id, role: "owner" };

  const { data: member } = await admin
    .from("team_members")
    .select("entity_id, role")
    .eq("user_id", userId)
    .eq("entity_type", type)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (member) return { entityId: member.entity_id, role: member.role as TeamRole };
  return null;
}

/**
 * True when the user may change the team itself -- inviting and removing.
 * Owners and admins can; plain members cannot, because a member who can add
 * members can quietly promote themselves.
 */
export async function canManageTeam(
  userId: string,
  type: EntityType,
  entityId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const table = type === "startup" ? "startups" : "investors";

  const { data: owned } = await admin
    .from(table)
    .select("id")
    .eq("id", entityId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (owned) return true;

  const { data: member } = await admin
    .from("team_members")
    .select("role")
    .eq("entity_type", type)
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .maybeSingle();

  return member?.role === "admin";
}
