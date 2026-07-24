import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "Missing dealId" }, { status: 400 });

  const admin = createAdminClient();

  const { data: deal } = await admin
    .from("deals")
    .select("id, startup_id, investor_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const [{ data: startup }, { data: investorRow }, { data: profile }] = await Promise.all([
    admin.from("startups").select("id, owner_id").eq("id", deal.startup_id).maybeSingle(),
    admin.from("investors").select("id, owner_id").eq("id", deal.investor_id).maybeSingle(),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const isParticipant = startup?.owner_id === user.id || investorRow?.owner_id === user.id;
  const isAdmin = profile?.role === "admin";
  if (!isParticipant && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ data: reports }, { data: startupWithDocs }, { data: nda }] = await Promise.all([
    admin
      .from("ai_reports")
      .select("id, type, content, created_at")
      .eq("startup_id", deal.startup_id)
      .eq("investor_id", deal.investor_id)
      .eq("type", "due_diligence")
      .order("created_at", { ascending: false }),
    admin
      .from("startups")
      .select("require_nda, documents:startup_documents(*)")
      .eq("id", deal.startup_id)
      .single(),
    admin
      .from("nda_records")
      .select("signed_at")
      .match({ startup_id: deal.startup_id, investor_id: deal.investor_id })
      .maybeSingle(),
  ]);

  const ndaSigned = !!nda?.signed_at;
  const requireNda = !!startupWithDocs?.require_nda;
  const documents = (startupWithDocs?.documents || []).map((doc: { requires_nda: boolean } & Record<string, unknown>) => ({
    ...doc,
    locked: !isAdmin && doc.requires_nda && requireNda && !ndaSigned,
  }));

  return NextResponse.json({
    reports: reports ?? [],
    documents,
    ndaStatus: !nda ? "none" : nda.signed_at ? "signed" : "pending",
  });
}
