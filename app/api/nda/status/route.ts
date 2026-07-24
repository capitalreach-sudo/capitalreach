import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startupId = req.nextUrl.searchParams.get("startupId");
  const investorId = req.nextUrl.searchParams.get("investorId");
  if (!startupId || !investorId) return NextResponse.json({ error: "Missing startupId or investorId" }, { status: 400 });

  const admin = createAdminClient();

  const [{ data: startup }, { data: investor }, { data: profile }] = await Promise.all([
    admin.from("startups").select("id, owner_id").eq("id", startupId).maybeSingle(),
    admin.from("investors").select("id, owner_id").eq("id", investorId).maybeSingle(),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const isParticipant = startup?.owner_id === user.id || investor?.owner_id === user.id;
  if (!isParticipant && profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: nda } = await admin
    .from("nda_records")
    .select("signed_at")
    .match({ startup_id: startupId, investor_id: investorId })
    .maybeSingle();

  const status = !nda ? "none" : nda.signed_at ? "signed" : "pending";
  return NextResponse.json({ status, signedAt: nda?.signed_at ?? null });
}
