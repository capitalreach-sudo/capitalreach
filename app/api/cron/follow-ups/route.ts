import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { notifyUser, notifyUsers } from "@/lib/notify-user";
import { logSystemEvent } from "@/lib/system-events";
import { matchesSavedSearch, type SavedSearchFilters } from "@/lib/search-match";
import { listingCompleteness, type CompletenessInput } from "@/lib/listing-completeness";
import { scoreStartup, isOpenAIConfigured } from "@/lib/openai";

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

  // ── 093: scores learn to age ────────────────────────────────────────────
  // Re-score listings whose content moved after the model last looked. A few
  // per run keeps the cost bounded; oldest drift first means nothing waits
  // forever. Skipped entirely while the model is unconfigured — the stale
  // score stays, which is still better than no score.
  let rescored = 0;
  if (isOpenAIConfigured) {
    const { data: stale } = await admin
      .from("startups")
      .select("id, name, problem, solution, market, competitive_advantage, mrr, arr, user_count, growth_rate, stage, updated_at, scored_at, founders:startup_founders(name, role, linkedin_url), documents:startup_documents(type), milestones:startup_milestones(description)")
      .eq("status", "active")
      .not("scored_at", "is", null)
      .limit(200);
    const drifted = (stale ?? [])
      .filter(s => s.updated_at && s.scored_at && s.updated_at > s.scored_at)
      .sort((a, b) => (a.scored_at! < b.scored_at! ? -1 : 1))
      .slice(0, 10);
    for (const s of drifted) {
      try {
        const score = await scoreStartup({
          name: s.name, problem: s.problem, solution: s.solution, market: s.market,
          competitive_advantage: s.competitive_advantage, mrr: s.mrr, arr: s.arr,
          user_count: s.user_count, growth_rate: s.growth_rate,
          founders: (s.founders as { name: string; role: string; linkedin_url: string | null }[]) || [],
          documents: (s.documents as { type: string }[]) || [],
          milestones: (s.milestones as { description: string }[]) || [],
          stage: s.stage,
        });
        await admin.from("startups")
          .update({ vaultrise_score: score, scored_at: new Date().toISOString() })
          .eq("id", s.id);
        rescored++;
      } catch { /* one refusal must not stop the queue */ }
    }
  }

  // ── F: unfinished drafts ────────────────────────────────────────────────
  // A founder starts a listing, fills in half of it, gets pulled into a
  // customer call, and the draft sits there. Nothing ever mentioned it again.
  // Drafts are the cheapest supply this marketplace will ever have — the
  // person already decided to be here.
  //
  // Two nudges, at three days and at fourteen, then silence. A third would be
  // nagging, and the ones that go quiet after two were never going to finish.
  const NUDGE_DAYS = [3, 14];
  const { data: drafts } = await admin
    .from("startups")
    .select(`
      id, name, slug, owner_id, created_at, draft_nudged_at, draft_nudge_count,
      tagline, problem, solution, market, competitive_advantage, use_of_funds,
      website, pitch_deck_url, funding_target, equity_offered, min_check_size,
      booking_url, mrr, arr, paying_customers, user_count,
      founders:startup_founders(linkedin_url),
      documents:startup_documents(id),
      milestones:startup_milestones(id)
    `)
    .eq("status", "draft")
    .lt("draft_nudge_count", NUDGE_DAYS.length)
    .limit(500);

  let nudged = 0;
  const nowMs = Date.now();
  for (const draft of drafts ?? []) {
    if (!draft.owner_id) continue;
    const sent = draft.draft_nudge_count ?? 0;
    const ageDays = Math.floor((nowMs - new Date(draft.created_at).getTime()) / 86_400_000);
    if (ageDays < NUDGE_DAYS[sent]) continue;
    // Never twice in a day, whatever the cron does.
    if (draft.draft_nudged_at && nowMs - new Date(draft.draft_nudged_at).getTime() < 86_400_000) continue;

    // The nudge names the single most valuable missing thing rather than
    // saying "your listing is incomplete", which a founder already knows.
    const { percent, next } = listingCompleteness(draft as unknown as CompletenessInput);

    await notifyUser({
      userId: draft.owner_id,
      type: "listing_update",
      title: `${draft.name || "Your listing"} is ${percent}% ready`,
      body: next
        ? "One thing would move it furthest — open it and see what."
        : "Everything is filled in. Submit it for review to go live.",
      href: "/dashboard/startup/edit",
    });

    await admin.from("startups").update({
      draft_nudged_at: new Date().toISOString(),
      draft_nudge_count: sent + 1,
    }).eq("id", draft.id);
    nudged++;
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
      .select("id, name, tagline, industry, stage, country, mrr, vaultrise_score, funding_target, runway_months, growth_rate, round_close_date, business_model, demo_video_url")
      .eq("status", "active")
      // listed_at, not created_at: a listing is born draft and goes live at
      // approval, often more than a day later — matching on creation time
      // meant most listings could never alert anyone.
      .gte("listed_at", since),
    admin
      .from("saved_searches")
      .select("id, name, filters, investor:investors(owner_id)"),
  ]);

  let searchNotified = 0;
  if ((fresh ?? []).length > 0) {
    for (const search of searches ?? []) {
      const ownerId = search.investor?.owner_id;
      if (!ownerId) continue;
      const f = (search.filters ?? {}) as SavedSearchFilters;
      // Same matcher the browse page uses — an alert fires iff the saved
      // search would show the listing.
      const matches = (fresh ?? []).filter((st) => matchesSavedSearch(f, st));
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
    checked: due?.length ?? 0, notified, draftNudges: nudged, rescored, freshStartups: fresh?.length ?? 0, searchAlerts: searchNotified, suspensionsLifted: lifted,
  });

  // Prune info rows older than 30 days in passing; errors stay until deleted
  // from /admin. Piggybacks on the daily run instead of needing its own job.
  await admin.from("system_events").delete().eq("level", "info")
    .lt("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .then(undefined, () => {});

  // ── C28: nudge on document requests still open after 3 days ──────────────
  // One nudge per request (reminded_at), so a founder who is ignoring it
  // hears once more and then never again from the machine.
  let docNudges = 0;
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stale } = await admin
      .from("document_requests")
      .select("id, doc_type, startup:startups(name, owner_id)")
      .eq("status", "open")
      .is("reminded_at", null)
      .lt("created_at", threeDaysAgo)
      .limit(200);
    for (const r of stale ?? []) {
      const st = r.startup as unknown as { name: string; owner_id: string } | null;
      if (!st?.owner_id) continue;
      await notifyUser({
        userId: st.owner_id,
        type: "doc_request",
        title: `Still waiting: a document request on ${st.name}`,
        body: "An investor asked for a document three days ago. Uploading it closes the request automatically.",
        href: "/dashboard/startup/documents",
      }).catch(() => {});
      docNudges += 1;
    }
    if (stale?.length) {
      await admin.from("document_requests")
        .update({ reminded_at: new Date().toISOString() })
        .in("id", stale.map((r) => r.id))
        .then(undefined, () => {});
    }
  } catch (e) {
    console.error("[cron] doc-request nudges failed:", e);
  }

  return NextResponse.json({
    ok: true,
    docNudges,
    checked: due?.length ?? 0,
    notified,
    draftNudges: nudged,
    rescored,
    freshStartups: fresh?.length ?? 0,
    searchAlerts: searchNotified,
  });
}
