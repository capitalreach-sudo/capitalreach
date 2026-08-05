import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";

/**
 * Record that the signed-in investor opened a document (migration 039).
 * Fire-and-forget from the client; RLS's WITH CHECK pins investor_id to the
 * caller's own entity, so nobody can log views as someone else. Non-investors
 * simply record nothing.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ tracked: false });

  const { documentId } = await req.json().catch(() => ({}));
  if (!isUuid(documentId)) return NextResponse.json({ error: "documentId required" }, { status: 400 });

  const { data: inv } = await supabase.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!inv) return NextResponse.json({ tracked: false });

  const { error } = await supabase.from("document_views").insert({ document_id: documentId, investor_id: inv.id });
  return NextResponse.json({ tracked: !error });
}
