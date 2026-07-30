import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// watchlists.investor_id references investors(id), NOT profiles(id).
//
// Both handlers previously passed user.id — a profiles id — which no investor
// row can ever match, so the watchlists_own RLS policy rejected every insert
// and every delete matched zero rows. Saving a startup has never worked through
// this route. Resolve the caller's investors row first.
async function resolveInvestorId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("investors")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId, note } = await req.json() as { startupId: string; note?: string | null };
  if (!startupId) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const investorId = await resolveInvestorId(supabase, user.id);
  if (!investorId) {
    return NextResponse.json(
      { error: "Complete your investor profile before saving startups." },
      { status: 403 }
    );
  }

  // A saved startup with no reason attached stops being a shortlist and becomes
  // a pile. `note` is optional, and only written when the caller sends the key
  // -- so re-saving without a note doesn't wipe one already there.
  const row: Record<string, unknown> = { investor_id: investorId, startup_id: startupId };
  if (note !== undefined) {
    row.note = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null;
  }

  const { error } = await supabase
    .from("watchlists")
    .upsert(row, { onConflict: "investor_id,startup_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId } = await req.json() as { startupId: string };
  if (!startupId) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const investorId = await resolveInvestorId(supabase, user.id);
  if (!investorId) return NextResponse.json({ saved: false });

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("investor_id", investorId)
    .eq("startup_id", startupId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved: false });
}
