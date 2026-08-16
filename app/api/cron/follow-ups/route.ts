import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { notifyUser, notifyUsers } from "@/lib/notify-user";
import { logSystemEvent } from "@/lib/system-events";

export const dynamic = "force-dynamic";

/**
 * Fires follow-up reminders for deals whose next_follow_up has come due.
 *
 * next_follow_up has been settable since migration 016 and nothing has ever
 * acted on it -- a date you write down and are never reminded of is a note to
 * self, not a reminder.
 *
 * Idempotency without another column: the reminder clears next_follow_up as it
 * fires. The date has done its job, the deal card falls back to "+ Set
 * follow-up" prompting the next one, and the row no longer matches this query
 * so a second run in the same day cannot double-notify. The date is not lost --
 * it goes into deal_activity as a permanent record.
 *
 * Trigger with Vercel Cron (see vercel.json) or any scheduler that can send the
 * bearer token.
 */
export async function GET(req: NextRequest) {
  // Vercel Cron sends the project's CRON_SECRET as a bearer token. Without a
  // configured secret this endpoint stays shut rather than defaulting open --
  // it can write to every deal on the platform.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/follow-ups] CRON_SECRET is not set — refusing to run.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Due today or overdue. Concluded deals are excluded: a reminder to follow up
  // on something already closed or passed is noise.
  const { data: due, error } = await admin
    .from("deals")
    // startup_id / investor_id are selected explicitly: deal_activity has them
    // NOT NULL, and the embedded joins below don't expose the raw foreign keys.
    // Without them the activity insert fails and -- because that insert
    // deliberately swallows its errors -- does so silently.
    .select("id, next_follow_up, startup_id, investor_id, startup:startups(name, owner_id), investor:investors(display_name, owner_id)")
    .not("next_follow_up", "is", null)
    .lte("next_follow_up", today)
    .not("status", "in", "(closed,passed)");

  if (error) {
    console.error("[cron/follow-ups]", error);
    await logSystemEvent("cron/follow-ups", "error", "Due-deals query failed", { error: error.message });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  let notified = 0;

  for (const deal of due ?? []) {
    const startup  = deal.startup;
    const investor = deal.investor;
    const counterpart = startup?.name ?? investor?.display_name ?? "a deal";

    await notifyUsers([startup?.owner_id, investor?.owner_id], {
      type:  "follow_up_due",
      title: `Follow-up due — ${counterpart}`,
      body:  `You set a reminder for ${deal.next_follow_up}.`,
      href:  `/deals?deal=${deal.id}`,
    });

    // Permanent record, so clearing the date below loses nothing.
    await admin.from("deal_activity").insert({
      deal_id:     deal.id,
      startup_id:  deal.startup_id,
      investor_id: deal.investor_id,
      actor_id:    null,
      type:        "note",
      body:        `Follow-up reminder sent (was due ${deal.next_follow_up}).`,
    }).then(undefined, () => {});

    await admin.from("deals").update({ next_follow_up: null }).eq("id", deal.id);
    notified++;
  }

  // ── Saved-search matches ────────────────────────────────────────────────
  // The alert half of saved searches: compare startups listed since the last
  // daily run against every saved search and tell each search's owner. The
  // 25-hour window overlaps the 24-hour cadence slightly so a slow run can't
  // open a gap; the overlap can at worst repeat a notification, and a repeat
  // beats a silent miss.
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const [{ data: fresh }, { data: searches }] = await Promise.all([
    admin
      .from("startups")
      .select("id, name, tagline, industry, stage, country, mrr, vaultrise_score")
      .eq("status", "active")
      .gte("created_at", since),
    admin
      .from("saved_searches")
      .select("id, name, filters, investor:investors(owner_id)"),
  ]);

  let searchNotified = 0;
  if ((fresh ?? []).length > 0) {
    for (const search of searches ?? []) {
      const ownerId = search.investor?.owner_id;
      if (!ownerId) continue;
      const f = (search.filters ?? {}) as {
        query?: string; industries?: string[]; stages?: string[];
        mrrMin?: number; aiScoreMin?: number; country?: string;
      };
      const q = (f.query ?? "").trim().toLowerCase();
      const matches = (fresh ?? []).filter((st) =>
        (!f.industries?.length || f.industries.includes(st.industry)) &&
        (!f.stages?.length     || f.stages.includes(st.stage)) &&
        (!f.country            || f.country === st.country) &&
        ((st.mrr ?? 0)             >= (f.mrrMin ?? 0)) &&
        ((st.vaultrise_score ?? 0) >= (f.aiScoreMin ?? 0)) &&
        (!q || st.name.toLowerCase().includes(q) || (st.tagline ?? "").toLowerCase().includes(q))
      );
      if (!matches.length) continue;

      await notifyUser({
        userId: ownerId,
        type:   "search_match",
        title:  matches.length === 1
          ? `New match for "${search.name}": ${matches[0].name}`
          : `${matches.length} new matches for "${search.name}"`,
        body:   matches.slice(0, 3).map((m) => m.name).join(", ") + (matches.length > 3 ? "…" : ""),
        href:   matches.length === 1
          ? `/startups?q=${encodeURIComponent(matches[0].name)}`
          : `/startups?q=${encodeURIComponent(f.query ?? "")}`,
      });
      searchNotified++;
    }
  }

  // ── Lift expired timed suspensions ────────────────────────────────────────
  // suspended_until was written by /api/admin/suspend and the suspension page
  // told users "scheduled to lift on X" — but nothing ever lifted it, so every
  // 7-day suspension was permanent. This sweep makes the promise true.
  let lifted = 0;
  {
    const nowIso = new Date().toISOString();
    const { data: expired } = await admin
      .from("profiles")
      .select("id")
      .eq("suspended", true)
      .not("suspended_until", "is", null)
      .lte("suspended_until", nowIso);
    for (const p of expired ?? []) {
      const { error } = await admin
        .from("profiles")
        .update({ suspended: false, account_status: "active", suspended_reason: null, suspended_at: null, suspended_until: null })
        .eq("id", p.id);
      if (!error) {
        lifted++;
        await admin.from("startups").update({ status: "active" }).eq("owner_id", p.id).eq("status", "suspended");
      }
    }
    if (lifted) await logSystemEvent("cron/follow-ups", "info", `Lifted ${lifted} expired suspension(s)`);
  }

  // A success heartbeat, so /admin can show when the cron last ran at all --
  // the difference between "quiet because nothing was due" and "quiet because
  // it has not run for a week" is exactly what this table exists to expose.
  await logSystemEvent("cron/follow-ups", "info", "Run completed", {
    checked: due?.length ?? 0, notified, freshStartups: fresh?.length ?? 0, searchAlerts: searchNotified, suspensionsLifted: lifted,
  });

  // Prune info rows older than 30 days in passing; errors stay until deleted
  // from /admin. Piggybacks on the daily run instead of needing its own job.
  await admin.from("system_events").delete().eq("level", "info")
    .lt("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .then(undefined, () => {});

  return NextResponse.json({
    ok: true,
    checked: due?.length ?? 0,
    notified,
    freshStartups: fresh?.length ?? 0,
    searchAlerts: searchNotified,
  });
}
