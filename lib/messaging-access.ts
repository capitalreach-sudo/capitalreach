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

export interface MemberEntities {
  startupIds: string[];
  investorIds: string[];
}

export interface MessagingAccess {
  admin: boolean;
  /** Resolved for non-admins only: it limits their view, and an admin's view is not limited. */
  pairs: SealedPair[];
  /** Every startup and investor the user owns or holds a seat on. Empty for admins. */
  entities: MemberEntities;
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

export interface ViewerEntities {
  startupIds: ReadonlySet<string>;
  investorIds: ReadonlySet<string>;
}

/**
 * A thread a member may use.
 *
 * Two shapes. A pair thread (one startup, one investor, no second party)
 * opens on a sealed deal between exactly those two. A thread carrying a
 * recipient_* column is the other shape: only an admin can create one (both
 * producers -- deals/share and messages/start's peer branches -- refuse a
 * non-admin sender before the insert), so that column marks staff-to-member
 * outreach, never the founder-to-founder or investor-to-investor channel the
 * sealed-deal rule withholds. It opens for whichever entity of the viewer's
 * own sits in one of the thread's four party columns, which is either the
 * outreach's addressee or, for an admin's own member entity, the admin
 * themself signed in as a regular user of it.
 */
export function threadOpenFor(
  thread: ThreadParties,
  sealed: SealedPair[] | ReadonlySet<string>,
  viewer?: ViewerEntities,
): boolean {
  if (thread.recipient_startup_id || thread.recipient_investor_id) {
    if (!viewer) return false;
    return (
      (!!thread.startup_id && viewer.startupIds.has(thread.startup_id)) ||
      (!!thread.recipient_startup_id && viewer.startupIds.has(thread.recipient_startup_id)) ||
      (!!thread.investor_id && viewer.investorIds.has(thread.investor_id)) ||
      (!!thread.recipient_investor_id && viewer.investorIds.has(thread.recipient_investor_id))
    );
  }
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

const EMPTY_ENTITIES: MemberEntities = { startupIds: [], investorIds: [] };

export async function messagingAccess(userId: string): Promise<MessagingAccess> {
  try {
    if (await isAdminUser(userId)) return { admin: true, pairs: [], entities: EMPTY_ENTITIES };
    const [pairs, entities] = await Promise.all([sealedCounterpartPairs(userId), entitiesOf(userId)]);
    return { admin: false, pairs, entities };
  } catch {
    return { admin: false, pairs: [], entities: EMPTY_ENTITIES };
  }
}

export async function messagingAvailable(userId: string): Promise<boolean> {
  const access = await messagingAccess(userId);
  if (access.admin || access.pairs.length > 0) return true;
  // No sealed deal, but the member may still hold an admin-authored thread
  // (support outreach, a shared listing with a note): check the same set
  // usableThreadIds would return rather than declaring Messages off twice.
  // myThreadIds (inside usableThreadIds) has no fail-closed of its own, so
  // this call needs its own -- the module's rule is every read failure
  // answers "not available".
  try {
    return (await usableThreadIds(userId, access)).length > 0;
  } catch {
    return false;
  }
}

/**
 * The thread ids this user may still use: every thread they belong to for an
 * admin, and for a member every sealed-pair thread plus any admin-authored
 * thread that names one of their own entities.
 */
export async function usableThreadIds(userId: string, access: MessagingAccess): Promise<string[]> {
  const ids = await myThreadIds(userId);
  if (access.admin || !ids.length) return ids;
  const admin = createAdminClient();
  const { data } = await admin
    .from("threads")
    .select("id, startup_id, investor_id, recipient_startup_id, recipient_investor_id")
    .in("id", ids);
  const keys = new Set(access.pairs.map((p) => pairKey(p.startupId, p.investorId)));
  const viewer: ViewerEntities = {
    startupIds: new Set(access.entities.startupIds),
    investorIds: new Set(access.entities.investorIds),
  };
  return (data ?? []).filter((t) => threadOpenFor(t, keys, viewer)).map((t) => t.id as string);
}
