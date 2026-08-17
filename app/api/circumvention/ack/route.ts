import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { CIRCUMVENTION_TERMS_VERSION } from "@/lib/circumvention-text";

/**
 * Non-circumvention acknowledgment (Phase 1, mechanism B).
 *
 * POST { startupId } — records that the signed-in investor accepted the 2%
 * success-fee terms for this startup before first contact. One row per
 * (investor, startup); a repeat POST is idempotent and returns the original
 * timestamp. IP + user agent are stamped server-side (never trusted from the
 * body). Founders and admins never need to ack — the fee is on the founder
 * side and the record protects CapitalReach's connection date.
 *
 * GET ?startupId= — { acknowledged, acknowledgedAt } for the caller.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const startupId = typeof body.startupId === "string" ? body.startupId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(startupId)) {
    return NextResponse.json({ error: "Invalid startup" }, { status: 400 });
  }

  // Only investors acknowledge; the row is keyed by the investor's *profile*
  // id (auth user), which is what deals and messages resolve back to.
  const myInvestor = await resolveEntity(user.id, "investor");
  if (!myInvestor) {
    return NextResponse.json({ error: "Only investors acknowledge non-circumvention terms" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: startup } = await admin.from("startups").select("id, name, status").eq("id", startupId).maybeSingle();
  if (!startup) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  if (startup.status !== "active") {
    return NextResponse.json({ error: "That startup is not currently listed" }, { status: 409 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 400) || null;

  // Idempotent: the FIRST acknowledgment is the legally interesting one, so a
  // repeat never overwrites its timestamp.
  const { data: existing } = await admin
    .from("circumvention_acks")
    .select("id, acknowledged_at")
    .match({ investor_id: user.id, startup_id: startup.id })
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ acknowledged: true, ackId: existing.id, acknowledgedAt: existing.acknowledged_at, repeat: true });
  }

  const { data: ack, error } = await admin
    .from("circumvention_acks")
    .insert({
      investor_id: user.id,
      startup_id: startup.id,
      terms_version: CIRCUMVENTION_TERMS_VERSION,
      ip_address: ip,
      user_agent: ua,
    })
    .select("id, acknowledged_at")
    .single();

  if (error || !ack) {
    // Unique-violation race: another tab won. Read it back.
    if (error?.code === "23505") {
      const { data: again } = await admin
        .from("circumvention_acks")
        .select("id, acknowledged_at")
        .match({ investor_id: user.id, startup_id: startup.id })
        .maybeSingle();
      if (again) return NextResponse.json({ acknowledged: true, ackId: again.id, acknowledgedAt: again.acknowledged_at, repeat: true });
    }
    return NextResponse.json({ error: "Could not record acknowledgment" }, { status: 500 });
  }

  return NextResponse.json({ acknowledged: true, ackId: ack.id, acknowledgedAt: ack.acknowledged_at });
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startupId = req.nextUrl.searchParams.get("startupId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(startupId)) {
    return NextResponse.json({ error: "Invalid startup" }, { status: 400 });
  }
  // RLS: investors read their own acks.
  const { data } = await supabase
    .from("circumvention_acks")
    .select("id, acknowledged_at")
    .match({ investor_id: user.id, startup_id: startupId })
    .maybeSingle();
  return NextResponse.json({ acknowledged: !!data, ackId: data?.id ?? null, acknowledgedAt: data?.acknowledged_at ?? null });
}
