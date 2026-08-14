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
  } catch (err) {
    console.error(`[system-events] failed to log ${level} from ${source}:`, err);
  }
}
