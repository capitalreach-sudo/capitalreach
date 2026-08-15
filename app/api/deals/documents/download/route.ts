import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * Hand a deal participant a short-lived signed URL for one deal document.
 * The bucket is private; nothing openable ever ships to a non-participant.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("deal_documents")
    .select("file_path, startup:startups(owner_id), investor:investors(owner_id)")
    .eq("id", id)
    .single();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const startupOwner = (doc.startup as { owner_id?: string } | null)?.owner_id;
  const investorOwner = (doc.investor as { owner_id?: string } | null)?.owner_id;
  if (startupOwner !== user.id && investorOwner !== user.id) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signed } = await admin.storage
    .from("deal-documents")
    .createSignedUrl(doc.file_path, 60);
  if (!signed?.signedUrl) return NextResponse.json({ error: "Could not open document" }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
