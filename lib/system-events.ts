import { createAdminClient } from "@/lib/supabase-server";

/**
 * Records a background event where the admin page can see it.
 *
 * Cron runs and webhooks fail into console.error, which on Vercel is a log
 * stream nobody watches — a cron that has failed every night for a month is
 * indistinguishable from one that succeeded. Every background route now
 * reports its outcome here; /admin shows errors and the last success per
 * source, so "is the cron alive?" has an answer on a page that gets looked at.
 *
 * MUST be awaited by callers. Vercel freezes the lambda the moment the
 * response returns, so a fire-and-forget insert simply never runs — the same
 * lesson every notify call in this codebase already carries.
 *
 * Never throws: the logger being down must not take the route down with it.
 * The one failure it cannot record is its own, which falls back to
 * console.error — no way around that without a second logging system.
 */
export async function logSystemEvent(
  source: string,
  level: "info" | "error",
  message: string,
  detail?: unknown,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("system_events").insert({
      source,
      level,
      message: message.slice(0, 2000),
      detail: detail === undefined ? null : JSON.parse(JSON.stringify(detail)),
    });
    if (level === "error") await alertAdmins(admin, source, message);
  } catch (err) {
    console.error(`[system-events] failed to log ${level} from ${source}:`, err);
  }
}

/** How long one source stays quiet after alerting. */
const ALERT_COOLDOWN_MINUTES = 60;

/**
 * E57: an error on the admin page is only seen by someone already looking at
 * the admin page. The whole reason this table exists is that a cron failing
 * every night for a month looked exactly like one that worked — and a table
 * nobody opens has the same problem as a log stream nobody watches.
 *
 * So an error reaches the operator where they already are: the notification
 * bell. Throttled per source, because the failure mode of alerting is a
 * webhook erroring two hundred times an hour and burying everything else in
 * the bell — after which nobody reads that either.
 *
 * Never throws, for the same reason the logger does not: alerting failing
 * must not take down the route whose failure it is reporting.
 */
async function alertAdmins(
  admin: ReturnType<typeof createAdminClient>,
  source: string,
  message: string,
): Promise<void> {
  try {
    const since = new Date(Date.now() - ALERT_COOLDOWN_MINUTES * 60_000).toISOString();
    const { count } = await admin
      .from("system_events")
      .select("id", { count: "exact", head: true })
      .eq("source", source)
      .eq("level", "error")
      .gte("created_at", since);

    // The row just inserted is in this count, so the first error of a quiet
    // hour reads as 1. Anything above that is the same fire still burning.
    if ((count ?? 0) > 1) return;

    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").limit(20);
    const ids = (admins ?? []).map(a => a.id);
    if (!ids.length) return;

    const { notifyUsers } = await import("@/lib/notify-user");
    await notifyUsers(ids, {
      type: "fee_due",
      title: `Something is failing: ${source}`,
      body: message.slice(0, 160),
      href: "/admin",
    });
  } catch (err) {
    console.error(`[system-events] failed to alert on ${source}:`, err);
  }
}
