import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";
import { DOC_TYPES } from "@/lib/upload-validation";
import { resolveEntity } from "@/lib/membership";

const LABEL: Record<string, string> = { pitch_deck: "pitch deck", financial_model: "financial model", cap_table: "cap table", other: "document" };

/**
 * Document requests (C28). Previously a fire-and-forget notification: the
 * founder got a bell and nothing else existed. Now a document_requests row
 * with a status, so the founder has an outstanding block, the investor sees
 * what came back, uploads auto-fulfil, and the cron can nudge.
 *
 * POST  { startupId, docType, message?, dealId? } — investor asks
 * GET   — founder: requests on their startup · investor: their own
 * PATCH { id, status: 'fulfilled' | 'declined' } — founder resolves
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId, docType, message, dealId } = await req.json().catch(() => ({}));
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });
  if (!(DOC_TYPES as readonly string[]).includes(docType)) return NextResponse.json({ error: "invalid docType" }, { status: 400 });
  const msg = typeof message === "string" && message.trim() ? message.trim().slice(0, 500) : null;

  const admin = createAdminClient();
  const [{ data: inv }, { data: startup }] = await Promise.all([
    admin.from("investors").select("id, display_name, firm_name").eq("owner_id", user.id).maybeSingle(),
    admin.from("startups").select("owner_id, name, status").eq("id", startupId).maybeSingle(),
  ]);
  if (!inv) return NextResponse.json({ error: "Investors only" }, { status: 403 });
  if (!startup || startup.status !== "active") return NextResponse.json({ error: "Not found" }, { status: 404 });

  // One open request per (investor, startup, type): a repeat bumps the
  // founder again rather than creating a duplicate row.
  const { data: existing } = await admin.from("document_requests").select("id")
    .match({ startup_id: startupId, investor_id: inv.id, doc_type: docType, status: "open" }).maybeSingle();
  let requestId = existing?.id;
  if (!requestId) {
    const { data: row, error } = await admin.from("document_requests")
      .insert({ startup_id: startupId, investor_id: inv.id, doc_type: docType, message: msg, deal_id: isUuid(dealId ?? "") ? dealId : null })
      .select("id").single();
    if (error || !row) return NextResponse.json({ error: "Could not record request" }, { status: 500 });
    requestId = row.id;
  }

  await notifyUser({
    userId: startup.owner_id,
    type: "doc_request",
    title: `${inv.display_name ?? inv.firm_name ?? "An investor"} requested your ${LABEL[docType]}`,
    body: msg ?? "Upload it from your documents manager — the request is tracked there until you do.",
    href: "/dashboard/startup/documents",
  });
  return NextResponse.json({ requested: true, id: requestId, repeat: !!existing });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const mine = await resolveEntity(user.id, "startup");
  if (mine) {
    const { data } = await admin.from("document_requests")
      .select("id, doc_type, message, status, created_at, resolved_at, deal_id, investor:investors(slug, display_name, firm_name)")
      .eq("startup_id", mine.entityId)
      .order("status", { ascending: false }) // open > fulfilled > declined alphabetically reversed → open first
      .order("created_at", { ascending: false })
      .limit(200);
    return NextResponse.json({ role: "startup", requests: data ?? [] });
  }
  const { data: inv } = await admin.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!inv) return NextResponse.json({ role: null, requests: [] });
  const { data } = await admin.from("document_requests")
    .select("id, doc_type, message, status, created_at, resolved_at, deal_id, startup:startups(name, slug)")
    .eq("investor_id", inv.id)
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ role: "investor", requests: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status } = await req.json().catch(() => ({}));
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (status !== "fulfilled" && status !== "declined") return NextResponse.json({ error: "status must be fulfilled or declined" }, { status: 400 });
  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });
  const admin = createAdminClient();
  const { data: row, error } = await admin.from("document_requests")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", id).eq("startup_id", mine.entityId).eq("status", "open")
    .select("id, doc_type, investor:investors(owner_id), startup:startups(name, slug)")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found or already resolved" }, { status: 404 });
  const inv = row.investor as unknown as { owner_id: string } | null;
  const st = row.startup as unknown as { name: string; slug: string } | null;
  if (inv?.owner_id) {
    await notifyUser({
      userId: inv.owner_id,
      type: "doc_request",
      title: status === "fulfilled" ? `${st?.name ?? "The founder"} shared the ${LABEL[row.doc_type] ?? "document"} you asked for` : `${st?.name ?? "The founder"} declined your ${LABEL[row.doc_type] ?? "document"} request`,
      href: st ? `/startups/${st.slug}` : "/dashboard/investor",
    }).catch(() => {});
  }
  return NextResponse.json({ success: true });
}
