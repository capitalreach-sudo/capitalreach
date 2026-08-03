import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { notifyUsers } from "@/lib/notify-user";

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

  return NextResponse.json({ ok: true, checked: due?.length ?? 0, notified });
}
