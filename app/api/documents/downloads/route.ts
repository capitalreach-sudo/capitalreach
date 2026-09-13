import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { buildAccessContext, founderCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
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

  // The house rule its three siblings (viewers, savers, doc-views) already
  // follow, applied here too: a private or off-platform investor is COUNTED,
  // never NAMED, and naming at all is the paid seeInvestorIdentity signal.
  // This list was the one engagement surface that named everyone to every
  // tier. The dispute ledger is untouched -- document_downloads keeps the full
  // identity, watermark id and address server-side for the day a leaked file
  // needs resolving; what changes is only what the founder's analytics render.
  const [{ data: startupRow }, { isLaunch }] = await Promise.all([
    admin.from("startups").select("subscription_tier").eq("id", mine.entityId).maybeSingle(),
    getLaunchStatus(),
  ]);
  const ctx = buildAccessContext(
    { id: user.id, role: "startup", subscription_tier: startupRow?.subscription_tier ?? null },
    isLaunch,
  );
  const canSeeWho = founderCan(ctx).seeInvestorIdentity;

  const { data, error } = await admin
    .from("document_downloads")
    .select("document_id, downloaded_at, investor:investors(display_name, firm_name, is_public, is_external)")
    .eq("startup_id", mine.entityId)
    .order("downloaded_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) {
    console.warn("[documents/downloads] read failed:", error.message);
    return NextResponse.json({ error: "Could not load downloads" }, { status: 500 });
  }

  const downloads = (data ?? []).map((row) => {
    const investor = row.investor as unknown as
      { display_name: string | null; firm_name: string | null; is_public: boolean | null; is_external: boolean | null } | null;
    const namable = !!investor?.is_public && !investor?.is_external;
    return {
      documentId: row.document_id,
      at: row.downloaded_at,
      investorName: canSeeWho && namable
        ? (investor?.display_name?.trim() || investor?.firm_name?.trim() || null)
        : null,
    };
  });
  return NextResponse.json({ downloads });
}
