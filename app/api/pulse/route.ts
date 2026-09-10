import { NextResponse } from "next/server";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { buildAccessContext, investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";

/**
 * The public heartbeat: recent anonymized activity for the homepage feed.
 *
 * Privacy is the design constraint, not an afterthought:
 * - Startup names are shown ONLY for the fact that is already public (an
 *   active listing exists).
 * - Investors are NEVER named or located ("A new investor joined" is the
 *   entire disclosure) -- Jack's rule: investors get privacy.
 * - NDAs and closed rounds are announced as bare facts with no parties.
 *
 * Cached a minute; the feed is a heartbeat, not a firehose.
 *
 * Naming a company is advertising it, and a logged-out visitor is not
 * entitled to that -- the homepage withholds the ticker and the listings
 * table from them for the same reason, and a feed that names six companies
 * would put back what those guards take away. So the events are the same for
 * everybody and only the NAMES depend on who is asking. Per-viewer, hence no
 * shared cache.
 */
export const dynamic = "force-dynamic";

type PulseEvent = { kind: "listing" | "investor" | "nda" | "closed"; name?: string; at: string };

export async function GET() {
  const admin = createAdminClient();

  let mayName = false;
  try {
    const sb = await createServerSupabaseClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { data: prof } = await admin
        .from("profiles").select("id, role, subscription_tier, suspended, account_status")
        .eq("id", user.id).maybeSingle();
      if (prof) {
        const launch = await getLaunchStatus();
        const ctx = buildAccessContext(prof as Parameters<typeof buildAccessContext>[0], launch.isLaunch);
        mayName = prof.role === "admin" || prof.role === "startup"
          ? true
          : investorCan(ctx).viewListingDetail;
      }
    }
  } catch { /* anonymous is the safe default */ }
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [startups, investors, ndas, closed] = await Promise.all([
    admin.from("startups")
      .select("name, created_at")
      .eq("status", "active").eq("is_demo", false)
      .gte("created_at", since)
      .order("created_at", { ascending: false }).limit(6),
    admin.from("investors")
      .select("created_at")
      .eq("is_external", false).eq("is_demo", false)
      .gte("created_at", since)
      .order("created_at", { ascending: false }).limit(6),
    admin.from("nda_records")
      .select("signed_at")
      .not("signed_at", "is", null)
      .gte("signed_at", since)
      .order("signed_at", { ascending: false }).limit(4),
    admin.from("deals")
      .select("closed_at")
      .eq("status", "closed").not("closed_at", "is", null)
      .gte("closed_at", since)
      .order("closed_at", { ascending: false }).limit(4),
  ]);

  const events: PulseEvent[] = [
    ...(startups.data ?? []).map(s => ({
      kind: "listing" as const,
      ...(mayName ? { name: s.name } : {}),
      at: s.created_at,
    })),
    ...(investors.data ?? []).map(i => ({ kind: "investor" as const, at: i.created_at })),
    ...(ndas.data ?? []).map(n => ({ kind: "nda" as const, at: n.signed_at as string })),
    ...(closed.data ?? []).map(d => ({ kind: "closed" as const, at: d.closed_at as string })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  return NextResponse.json({ events });
}
