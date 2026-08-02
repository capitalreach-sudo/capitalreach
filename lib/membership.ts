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

/**
 * True when the user is a team member of either side of a deal.
 *
 * The deal-workflow routes all gate on `owner_id === user.id` for the two
 * sides, which predates teams: 023's RLS already lets a member *see* the
 * deal, so without this the API refuses people the database admits -- an
 * associate can watch the pipeline but gets a 403 the moment they act on it.
 * Callers keep their owner checks (no extra query on the common path) and OR
 * this in as the fallback.
 *
 * Entity ids come from rows the caller already fetched, never from request
 * input. On a database without team_members (023 not applied) the query
 * errors and this returns false -- owner-only, exactly the pre-team
 * behaviour.
 */
export async function isTeamMemberOfEither(
  userId: string,
  startupId: string | null | undefined,
  investorId: string | null | undefined
): Promise<boolean> {
  if (!startupId && !investorId) return false;
  const admin = createAdminClient();

  const clauses: string[] = [];
  if (startupId)  clauses.push(`and(entity_type.eq.startup,entity_id.eq.${startupId})`);
  if (investorId) clauses.push(`and(entity_type.eq.investor,entity_id.eq.${investorId})`);

  const { data, error } = await admin
    .from("team_members")
    .select("id")
    .eq("user_id", userId)
    .or(clauses.join(","))
    .limit(1)
    .maybeSingle();

  if (error) return false;
  return !!data;
}
