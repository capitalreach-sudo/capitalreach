import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { resend } from "@/lib/resend";
import { logSystemEvent } from "@/lib/system-events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily digest: one quiet email per person with something waiting —
 * proposals to answer, unread messages, yesterday's listing views. Nobody
 * lives inside the app; email is how a marketplace taps a shoulder.
 *
 * Discipline:
 *  - NOTHING waiting → no email. A digest of zeros trains deletion.
 *  - Demo accounts are never mailed.
 *  - One aggregate query per fact, not one per user.
 *  - Caps at 200 sends per run; Resend unconfigured → counts but no sends
 *    (the log shows what WOULD go out, so the feature is testable pre-domain).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/digest] CRON_SECRET is not set — refusing to run.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fact 1: pending proposals per recipient user.
  const { data: proposals } = await admin
    .from("deal_proposals")
    .select("from_side, startup:startups(owner_id), investor:investors(owner_id)")
    .eq("status", "pending");
  const pending = new Map<string, number>();
  for (const p of proposals ?? []) {
    const st = p.startup as unknown as { owner_id?: string | null } | null;
    const inv = p.investor as unknown as { owner_id?: string | null } | null;
    const recipient = p.from_side === "investor" ? st?.owner_id : inv?.owner_id;
    if (recipient) pending.set(recipient, (pending.get(recipient) ?? 0) + 1);
  }

  // Fact 2: unread messages per user (messages in their threads, sent by
  // others, newer than their last read). Approximation that errs quiet:
  // count messages from the last 24h they haven't read.
  const { data: unreadRows } = await admin
    .from("messages")
    .select("sender_id, read_at, created_at, thread:threads(startup_id, investor_id, recipient_startup_id, recipient_investor_id)")
    .is("read_at", null)
    .gte("created_at", since)
    .limit(2000);
  const unread = new Map<string, number>();
  if (unreadRows?.length) {
    const entityOwners = new Map<string, string>();
    const [{ data: sts }, { data: invs }] = await Promise.all([
      admin.from("startups").select("id, owner_id"),
      admin.from("investors").select("id, owner_id"),
    ]);
    for (const r of sts ?? []) if (r.owner_id) entityOwners.set(r.id, r.owner_id);
    for (const r of invs ?? []) if (r.owner_id) entityOwners.set(r.id, r.owner_id);
    for (const m of unreadRows) {
      const th = m.thread as unknown as { startup_id?: string; investor_id?: string; recipient_startup_id?: string; recipient_investor_id?: string } | null;
      if (!th) continue;
      const parties = [th.startup_id, th.investor_id, th.recipient_startup_id, th.recipient_investor_id]
        .map(id => (id ? entityOwners.get(id) : undefined))
        .filter((x): x is string => !!x && x !== m.sender_id);
      for (const uid of Array.from(new Set(parties))) unread.set(uid, (unread.get(uid) ?? 0) + 1);
    }
  }

  // Fact 3: yesterday's listing views per founder.
  const { data: views } = await admin
    .from("startup_views")
    .select("startup:startups(owner_id)")
    .gte("created_at", since)
    .limit(5000);
  const viewCounts = new Map<string, number>();
  for (const v of views ?? []) {
    const owner = (v.startup as unknown as { owner_id?: string | null } | null)?.owner_id;
    if (owner) viewCounts.set(owner, (viewCounts.get(owner) ?? 0) + 1);
  }

  // Union of everyone with something to hear — then drop demo accounts.
  const userIds = Array.from(new Set([...Array.from(pending.keys()), ...Array.from(unread.keys()), ...Array.from(viewCounts.keys())])).slice(0, 400);
  if (userIds.length === 0) {
    await logSystemEvent("digest", "info", "No digests due", {}).catch(() => {});
    return NextResponse.json({ sent: 0, candidates: 0 });
  }
  const { data: profiles } = await admin
    .from("profiles").select("id, email, full_name").in("id", userIds);

  let sent = 0;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://capitalreach.vercel.app";
  for (const prof of profiles ?? []) {
    if (!prof.email || /@capitalreach\.(test|demo)$/.test(prof.email)) continue;
    if (sent >= 200) break;
    const parts: string[] = [];
    const p = pending.get(prof.id); const u = unread.get(prof.id); const v = viewCounts.get(prof.id);
    if (p) parts.push(`<li><strong>${p}</strong> deal proposal${p > 1 ? "s" : ""} waiting for your answer</li>`);
    if (u) parts.push(`<li><strong>${u}</strong> unread message${u > 1 ? "s" : ""}</li>`);
    if (v) parts.push(`<li><strong>${v}</strong> view${v > 1 ? "s" : ""} on your listing yesterday</li>`);
    if (!parts.length) continue;
    await resend.emails.send({
      from: "CapitalReach <digest@capitalreach.app>",
      to: prof.email,
      subject: "Waiting for you on CapitalReach",
      html: `<p>Hi ${prof.full_name ?? "there"},</p><ul>${parts.join("")}</ul><p><a href="${base}/dashboard">Open your dashboard →</a></p>`,
    }).catch(() => {});
    sent++;
  }

  await logSystemEvent("digest", "info", `Digest run: ${sent} sent of ${userIds.length} candidates`, {}).catch(() => {});
  return NextResponse.json({ sent, candidates: userIds.length });
}
