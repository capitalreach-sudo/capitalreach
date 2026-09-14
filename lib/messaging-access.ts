import { createAdminClient } from "@/lib/supabase-server";
import { myThreadIds } from "@/lib/threads";

/**
 * Whether a member has Messages at all, and with whom.
 *
 * A member has Messages only once a deal they are party to is sealed, and only
 * with the counterpart on that deal. Admins keep every conversation for
 * support. "Party" is the entity's owner or anyone holding a team seat on it
 * (team_members), the same membership lib/threads uses.
 *
 * deals.sealed_at is written only by the seal route, and only when both
 * signatures cover the same document (129 makes the column server-only), so a
 * non-null value is what this module filters on. The write routes still ask
 * lib/contact-policy per pair, where sealState is the authority; this module
 * decides what is shown and listed.
 *
 * Every read failure answers "not available". Hiding Messages from someone
 * entitled to them for one page load is recoverable; showing them to someone
 * who is not breaks the rule.
 */

export interface SealedPair {
  startupId: string;
  investorId: string;
}

export interface MessagingAccess {
  admin: boolean;
  /** Resolved for non-admins only: it limits their view, and an admin's view is not limited. */
  pairs: SealedPair[];
}

export function pairKey(startupId: string, investorId: string): string {
  return `${startupId}:${investorId}`;
}

/** The thread columns that decide whether a member may use a thread. */
export interface ThreadParties {
  startup_id: string | null;
  investor_id: string | null;
  recipient_startup_id?: string | null;
  recipient_investor_id?: string | null;
}

/**
 * A thread a member may use: one startup, one investor, no second party of
 * either kind, and a sealed deal between exactly those two.
 */
export function threadOpenFor(thread: ThreadParties, sealed: SealedPair[] | ReadonlySet<string>): boolean {
  if (thread.recipient_startup_id || thread.recipient_investor_id) return false;
  if (!thread.startup_id || !thread.investor_id) return false;
  const keys = sealed instanceof Set
    ? sealed
    : new Set((sealed as SealedPair[]).map((p) => pairKey(p.startupId, p.investorId)));
  return keys.has(pairKey(thread.startup_id, thread.investor_id));
}

async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

/** Every startup and investor the user owns or holds a seat on. */
async function entitiesOf(userId: string): Promise<{ startupIds: string[]; investorIds: string[] }> {
  const admin = createAdminClient();
  const [{ data: st }, { data: inv }, { data: seats }] = await Promise.all([
    admin.from("startups").select("id").eq("owner_id", userId),
    admin.from("investors").select("id").eq("owner_id", userId),
    admin.from("team_members").select("entity_type, entity_id").eq("user_id", userId),
  ]);
  const startupIds = new Set((st ?? []).map((r) => r.id as string));
  const investorIds = new Set((inv ?? []).map((r) => r.id as string));
  for (const s of seats ?? []) {
    if (s.entity_type === "startup") startupIds.add(s.entity_id as string);
    if (s.entity_type === "investor") investorIds.add(s.entity_id as string);
  }
  return { startupIds: Array.from(startupIds), investorIds: Array.from(investorIds) };
}

/** The (startup, investor) pairs of every sealed deal the user is party to. */
export async function sealedCounterpartPairs(userId: string): Promise<SealedPair[]> {
  try {
    const { startupIds, investorIds } = await entitiesOf(userId);
    if (!startupIds.length && !investorIds.length) return [];
    const admin = createAdminClient();
    const reads = [];
    if (startupIds.length) {
      reads.push(admin.from("deals").select("startup_id, investor_id")
        .in("startup_id", startupIds).not("sealed_at", "is", null));
    }
    if (investorIds.length) {
      reads.push(admin.from("deals").select("startup_id, investor_id")
        .in("investor_id", investorIds).not("sealed_at", "is", null));
    }
    const found = new Map<string, SealedPair>();
    for (const { data } of await Promise.all(reads)) {
      for (const d of data ?? []) {
        if (!d.startup_id || !d.investor_id) continue;
        found.set(pairKey(d.startup_id, d.investor_id), { startupId: d.startup_id, investorId: d.investor_id });
      }
    }
    return Array.from(found.values());
  } catch {
    return [];
  }
}

export async function messagingAccess(userId: string): Promise<MessagingAccess> {
  try {
    if (await isAdminUser(userId)) return { admin: true, pairs: [] };
    return { admin: false, pairs: await sealedCounterpartPairs(userId) };
  } catch {
    return { admin: false, pairs: [] };
  }
}

export async function messagingAvailable(userId: string): Promise<boolean> {
  const access = await messagingAccess(userId);
  return access.admin || access.pairs.length > 0;
}

/**
 * The thread ids this user may still use: every thread they belong to for an
 * admin, and only sealed-pair threads for a member.
 */
export async function usableThreadIds(userId: string, access: MessagingAccess): Promise<string[]> {
  if (!access.admin && !access.pairs.length) return [];
  const ids = await myThreadIds(userId);
  if (access.admin || !ids.length) return ids;
  const admin = createAdminClient();
  const { data } = await admin
    .from("threads")
    .select("id, startup_id, investor_id, recipient_startup_id, recipient_investor_id")
    .in("id", ids);
  const keys = new Set(access.pairs.map((p) => pairKey(p.startupId, p.investorId)));
  return (data ?? []).filter((t) => threadOpenFor(t, keys)).map((t) => t.id as string);
}
