import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";
import { sanitizeScores, sanitizeWeights, scorecardTotal } from "@/lib/scorecard";

/**
 * C27 investor scorecards. RLS scopes every row to the owning investor, so
 * these go through the caller's own client — a scorecard is private
 * judgement and must never be readable by the startup.
 *
 * GET  ?startupId= | (no param) → all of the caller's scorecards
 * PUT  { startupId, scores, weights?, note? } — upsert
 * DELETE { startupId }
 */
async function investorId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const { data } = await supabase.from("investors").select("id").eq("owner_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const invId = await investorId(supabase, user.id);
  if (!invId) return NextResponse.json({ scorecards: [] });

  const startupId = req.nextUrl.searchParams.get("startupId");
  let q = supabase.from("investor_scorecards").select("startup_id, scores, weights, total, note, updated_at").eq("investor_id", invId);
  if (startupId) {
    if (!isUuid(startupId)) return NextResponse.json({ error: "invalid startupId" }, { status: 400 });
    q = q.eq("startup_id", startupId);
  }
  const { data } = await q.limit(300);
  return NextResponse.json({ scorecards: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const startupId = typeof body.startupId === "string" ? body.startupId : "";
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const invId = await investorId(supabase, user.id);
  if (!invId) return NextResponse.json({ error: "Complete your investor profile first." }, { status: 403 });

  const scores = sanitizeScores(body.scores);
  const weights = sanitizeWeights(body.weights);
  const total = scorecardTotal(scores, weights);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null;

  const { data, error } = await supabase
    .from("investor_scorecards")
    .upsert({ investor_id: invId, startup_id: startupId, scores, weights, total, note, updated_at: new Date().toISOString() }, { onConflict: "investor_id,startup_id" })
    .select("startup_id, scores, weights, total, note, updated_at")
    .single();
  if (error || !data) return NextResponse.json({ error: "Could not save scorecard" }, { status: 500 });
  return NextResponse.json({ scorecard: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { startupId } = await req.json().catch(() => ({}));
  if (!isUuid(startupId ?? "")) return NextResponse.json({ error: "startupId required" }, { status: 400 });
  const invId = await investorId(supabase, user.id);
  if (!invId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await supabase.from("investor_scorecards").delete().match({ investor_id: invId, startup_id: startupId });
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
