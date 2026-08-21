import { createAdminClient } from "@/lib/supabase-server";

/**
 * Every thread id this user may act on.
 *
 * Extracted from the unread route so the attachment routes use the identical
 * membership rule — two implementations of "is this your thread" is how one
 * of them ends up wrong.
 *
 * And one of them was: the original resolved startups only through
 * threads.startup_id, ignoring recipient_startup_id — the receiving side of a
 * startup-to-startup thread. That founder's unread count skipped those
 * messages entirely and marking them read was Forbidden. Fixed here by
 * matching both columns.
 *
 * Membership = entity ownership plus team membership, so an associate acts
 * for the firm; team lookup errors degrade to owner-only, consistent with the
 * team model everywhere else.
 */
export async function myThreadIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: st }, { data: inv }, { data: memberships }] = await Promise.all([
    admin.from("startups").select("id").eq("owner_id", userId),
    admin.from("investors").select("id").eq("owner_id", userId),
    admin.from("team_members").select("entity_type, entity_id").eq("user_id", userId),
  ]);
  const sIds = (st ?? []).map((r) => r.id);
  const iIds = (inv ?? []).map((r) => r.id);
  for (const m of memberships ?? []) {
    if (m.entity_type === "startup" && !sIds.includes(m.entity_id)) sIds.push(m.entity_id);
    if (m.entity_type === "investor" && !iIds.includes(m.entity_id)) iIds.push(m.entity_id);
  }
  if (!sIds.length && !iIds.length) return [];

  const ors: string[] = [];
  if (sIds.length) {
    ors.push(`startup_id.in.(${sIds.join(",")})`);
    // The other half of a startup-to-startup thread.
    ors.push(`recipient_startup_id.in.(${sIds.join(",")})`);
  }
  if (iIds.length) {
    ors.push(`investor_id.in.(${iIds.join(",")})`);
    // The receiving half of a co-investor or investor-to-investor thread —
    // omitting it made those threads invisible to unread counts and
    // Forbidden to mark read, the exact bug the header warns about.
    ors.push(`recipient_investor_id.in.(${iIds.join(",")})`);
  }

  const { data: threads } = await admin.from("threads").select("id").or(ors.join(","));
  return (threads ?? []).map((t) => t.id);
}
