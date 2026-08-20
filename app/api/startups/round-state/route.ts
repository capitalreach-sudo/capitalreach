import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";

const STATES = ["open", "paused", "oversubscribed", "closed"] as const;
type RoundState = typeof STATES[number];

/**
 * POST { roundState?, showMomentum? } — the founder's own levers on a live
 * listing (B16 lifecycle, B19 public momentum). Owner or team member only.
 *   open          → listed, interest accepted
 *   oversubscribed→ listed with a badge, interest still accepted (waitlist)
 *   paused        → hidden from browse/search, listing page says paused,
 *                   interest disabled; flip back any time
 *   closed        → visible with a 'Round closed' badge, interest disabled
 * Admin moderation (status) is untouched by any of this.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const roundState = body.roundState as RoundState | undefined;
  const showMomentum = body.showMomentum as boolean | undefined;
  if (roundState !== undefined && !STATES.includes(roundState)) return NextResponse.json({ error: "Invalid round state" }, { status: 400 });
  if (showMomentum !== undefined && typeof showMomentum !== "boolean") return NextResponse.json({ error: "showMomentum must be a boolean" }, { status: 400 });
  if (roundState === undefined && showMomentum === undefined) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "No startup on this account" }, { status: 403 });

  const admin = createAdminClient();
  const updates: { round_state?: RoundState; round_state_changed_at?: string; show_momentum?: boolean } = {};
  if (roundState !== undefined) { updates.round_state = roundState; updates.round_state_changed_at = new Date().toISOString(); }
  if (showMomentum !== undefined) updates.show_momentum = showMomentum;
  // Read the prior state first: watchers are told about a CHANGE, and a
  // founder re-saving the same state must not re-notify five hundred people.
  const { data: before } = await admin.from("startups")
    .select("round_state, name, slug, status").eq("id", mine.entityId).maybeSingle();

  const { data, error } = await admin.from("startups").update(updates).eq("id", mine.entityId).select("id, round_state, show_momentum").single();
  if (error || !data) return NextResponse.json({ error: "Failed to update" }, { status: 500 });

  // The bell, for the people who saved this company. This is the one event a
  // watchlist exists for — "closing" and "oversubscribed" are exactly the
  // moments before it is too late to act. Awaited (serverless), best-effort,
  // and only on a real transition of a live listing.
  if (
    roundState !== undefined &&
    before && before.status === "active" && before.round_state !== roundState
  ) {
    try {
      const { data: savers } = await admin
        .from("watchlists")
        .select("investor:investors(owner_id)")
        .eq("startup_id", mine.entityId)
        .limit(500);
      const ids = Array.from(new Set(
        ((savers ?? []) as Array<{ investor: { owner_id: string | null } | null }>)
          .map(r => r.investor?.owner_id)
          .filter((id): id is string => !!id && id !== user.id)
      ));
      if (ids.length > 0) {
        const titles: Record<RoundState, string> = {
          open: `${before.name} reopened its round`,
          oversubscribed: `${before.name} is oversubscribed`,
          paused: `${before.name} paused its round`,
          closed: `${before.name} closed its round`,
        };
        await admin.from("notifications").insert(ids.map(uid => ({
          user_id: uid,
          type: "listing_update",
          title: titles[roundState],
          body: roundState === "closed" || roundState === "paused"
            ? "You saved this company to your watchlist."
            : "You saved this company — there may still be room.",
          href: `/startups/${before.slug}`,
        })));
      }
    } catch (e) {
      console.error("round-state broadcast failed:", e);
    }
  }

  return NextResponse.json({ success: true, roundState: data.round_state, showMomentum: data.show_momentum });
}
