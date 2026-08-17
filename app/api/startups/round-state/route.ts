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
  const { data, error } = await admin.from("startups").update(updates).eq("id", mine.entityId).select("id, round_state, show_momentum").single();
  if (error || !data) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true, roundState: data.round_state, showMomentum: data.show_momentum });
}
