import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resolveEntity } from "@/lib/membership";

/**
 * Who took a copy of which document, for the founder who owns it.
 *
 * document_downloads has RLS on with no permissive policy (migration 125), so
 * the row is only ever readable through a server route that has established
 * who is asking. That is the point at which the row is also trimmed: the
 * founder owns the document, so the investor's name and the moment are theirs
 * to see, but ip_address is a leak-investigation artefact and is never
 * selected here. A founder chasing a competitor does not get handed an
 * address to act on, and an address that never reaches the client cannot leak
 * out of one. watermark_id stays behind for the same reason -- it resolves a
 * leaked file, which is admin work, not a line in a document list.
 */
const MAX_ROWS = 500;

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("document_downloads")
    .select("document_id, downloaded_at, investor:investors(display_name, firm_name)")
    .eq("startup_id", mine.entityId)
    .order("downloaded_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) {
    console.warn("[documents/downloads] read failed:", error.message);
    return NextResponse.json({ error: "Could not load downloads" }, { status: 500 });
  }

  const downloads = (data ?? []).map((row) => {
    const investor = row.investor as unknown as { display_name: string | null; firm_name: string | null } | null;
    return {
      documentId: row.document_id,
      at: row.downloaded_at,
      investorName: investor?.display_name?.trim() || investor?.firm_name?.trim() || null,
    };
  });
  return NextResponse.json({ downloads });
}
