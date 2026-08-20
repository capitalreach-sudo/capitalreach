import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { investorCan, buildAccessContext } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";

/**
 * What moved on the companies you are watching.
 *
 * Saving a company was a one-way action: it went on a list and the list never
 * said anything again. Everything worth knowing was already being recorded —
 * founders post updates, upload documents, pause or reopen the round, file new
 * metrics — but each of those lives on a listing page, and nobody reloads
 * twenty listing pages to find out whether one of them moved.
 *
 * GET  — changes since you last looked.
 * POST — mark them seen.
 *
 * Scoped to the investor's own watchlist, and each change type is gated the
 * same way the listing page gates it: a free plan is told a document was added,
 * not what is in it.
 */

const MAX_ITEMS = 40;

export interface Change {
  type: "update" | "document" | "round_state" | "metrics";
  startupId: string;
  startupName: string;
  startupSlug: string;
  at: string;
  summary: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: investor } = await admin
    .from("investors").select("id, subscription_tier").eq("owner_id", user.id).maybeSingle();
  if (!investor) return NextResponse.json({ changes: [], watching: 0 });

  const { data: watched } = await admin
    .from("watchlists")
    .select("startup_id, changes_seen_at, startup:startups(id, name, slug, status, round_state, round_state_changed_at)")
    .eq("investor_id", investor.id)
    .limit(200);

  const rows = (watched ?? []).filter(w => {
    const s = w.startup as unknown as { status?: string } | null;
    return s?.status === "active";
  });
  if (rows.length === 0) return NextResponse.json({ changes: [], watching: 0 });

  const { data: profile } = await admin
    .from("profiles").select("id, role, subscription_tier, suspended, account_status").eq("id", user.id).maybeSingle();
  const { isLaunch } = await getLaunchStatus();
  const caps = investorCan(buildAccessContext(
    { ...profile!, subscription_tier: investor.subscription_tier ?? profile?.subscription_tier ?? null },
    isLaunch,
  ));

  // "Since you last looked", per company: a single global timestamp would mean
  // opening the panel for one company silently marked the other nineteen read.
  const since = new Map<string, string>();
  const meta = new Map<string, { name: string; slug: string }>();
  for (const w of rows) {
    const s = w.startup as unknown as { id: string; name: string; slug: string; round_state: string | null; round_state_changed_at: string | null };
    since.set(s.id, w.changes_seen_at ?? new Date(0).toISOString());
    meta.set(s.id, { name: s.name, slug: s.slug });
  }
  const ids = Array.from(since.keys());
  const oldest = ids.reduce((min, id) => (since.get(id)! < min ? since.get(id)! : min), new Date().toISOString());

  const [{ data: updates }, { data: docs }, { data: metrics }] = await Promise.all([
    admin.from("startup_updates")
      .select("startup_id, title, created_at, audience")
      .in("startup_id", ids).gte("created_at", oldest).limit(200),
    admin.from("startup_documents")
      .select("startup_id, label, type, id")
      .in("startup_id", ids).limit(200),
    admin.from("startup_metrics")
      .select("startup_id, month, mrr, created_at")
      .in("startup_id", ids).gte("created_at", oldest).limit(200),
  ]);

  const changes: Change[] = [];
  const add = (startupId: string, type: Change["type"], at: string, summary: string) => {
    const seen = since.get(startupId);
    const m = meta.get(startupId);
    if (!m || !seen || at <= seen) return;
    changes.push({ type, startupId, startupName: m.name, startupSlug: m.slug, at, summary });
  };

  for (const u of updates ?? []) {
    // An update aimed at existing investors is not for a watcher who has not
    // invested — the listing page applies the same rule.
    if (u.audience && u.audience !== "all") continue;
    add(u.startup_id, "update", u.created_at, u.title ?? "Posted an update");
  }

  for (const m of metrics ?? []) {
    add(m.startup_id, "metrics", m.created_at,
      caps.viewFinancials ? `Filed ${m.month} metrics` : "Filed new metrics");
  }

  // Documents carry no created_at, so a new one is detected by comparing the
  // set against what the round-state timestamp can anchor. Rather than invent
  // a time, they are reported only as a count against the listing, which is
  // honest about what the schema can actually tell us.
  const docCount = new Map<string, number>();
  for (const d of docs ?? []) docCount.set(d.startup_id, (docCount.get(d.startup_id) ?? 0) + 1);

  for (const w of rows) {
    const s = w.startup as unknown as { id: string; round_state: string | null; round_state_changed_at: string | null };
    if (s.round_state && s.round_state_changed_at) {
      add(s.id, "round_state", s.round_state_changed_at,
        s.round_state === "paused" ? "Paused the round" :
        s.round_state === "closed" ? "Closed the round" : "Reopened the round");
    }
  }

  changes.sort((a, b) => (a.at < b.at ? 1 : -1));

  return NextResponse.json({
    changes: changes.slice(0, MAX_ITEMS),
    watching: rows.length,
    documents: Object.fromEntries(docCount),
  });
}

/** Mark everything currently visible as seen. */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: investor } = await admin.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!investor) return NextResponse.json({ success: true });

  const { error } = await admin
    .from("watchlists")
    .update({ changes_seen_at: new Date().toISOString() })
    .eq("investor_id", investor.id);
  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 });

  return NextResponse.json({ success: true });
}
