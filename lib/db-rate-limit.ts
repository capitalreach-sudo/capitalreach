import { createAdminClient } from "@/lib/supabase-server";

/**
 * A rate limiter that lives in Postgres, not Redis.
 *
 * The Upstash limiter (lib/redis) fails OPEN when unconfigured — and prod has
 * no Redis — so it protects nothing today. This one always counts: it reads
 * the events this user logged for an action inside a window and refuses past
 * the cap. Use it for anything that notifies or emails another person, where
 * "the brake failed silently" means spam, not a slow page.
 *
 * Best-effort by design: a DB error fails OPEN (a hiccup must not block a
 * legitimate message), but the common path is a real, Redis-free ceiling.
 */
export async function dbRateLimit(
  userId: string,
  action: string,
  max: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterMs?: number }> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - windowMs).toISOString();
    const { count } = await admin
      .from("rate_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", action)
      .gte("created_at", since);
    if ((count ?? 0) >= max) return { ok: false, retryAfterMs: windowMs };
    await admin.from("rate_events").insert({ user_id: userId, action });
    return { ok: true };
  } catch {
    return { ok: true }; // never block a legitimate action on a limiter hiccup
  }
}

/** Common windows, named for readability at the call site. */
export const RATE = {
  perMinute: (n: number) => ({ max: n, windowMs: 60_000 }),
  perHour: (n: number) => ({ max: n, windowMs: 3_600_000 }),
  perDay: (n: number) => ({ max: n, windowMs: 86_400_000 }),
};
