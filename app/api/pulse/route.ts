import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

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
 */
export const revalidate = 60;

type PulseEvent = { kind: "listing" | "investor" | "nda" | "closed"; name?: string; at: string };

export async function GET() {
  const admin = createAdminClient();
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
    ...(startups.data ?? []).map(s => ({ kind: "listing" as const, name: s.name, at: s.created_at })),
    ...(investors.data ?? []).map(i => ({ kind: "investor" as const, at: i.created_at })),
    ...(ndas.data ?? []).map(n => ({ kind: "nda" as const, at: n.signed_at as string })),
    ...(closed.data ?? []).map(d => ({ kind: "closed" as const, at: d.closed_at as string })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  return NextResponse.json({ events });
}
