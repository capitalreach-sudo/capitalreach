import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { uploadRatelimit } from "@/lib/redis";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { notifyUsers } from "@/lib/notify-user";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** Resolve the caller's relationship to a deal: which side they're on (if any),
 *  and the deal row. Returns null if the deal doesn't exist. */
async function loadDealMembership(admin: ReturnType<typeof createAdminClient>, dealId: string, userId: string) {
  const { data: deal } = await admin
    .from("deals")
    .select("id, startup_id, investor_id, startup:startups(owner_id), investor:investors(owner_id)")
    .eq("id", dealId)
    .single();
  if (!deal) return null;
  const startupOwner = (deal.startup as { owner_id?: string } | null)?.owner_id;
  const investorOwner = (deal.investor as { owner_id?: string } | null)?.owner_id;
  let side: "startup" | "investor" | null = null;
  if (startupOwner === userId) side = "startup";
  else if (investorOwner === userId) side = "investor";
  return { deal, startupOwner, investorOwner, side };
}

// ── List the deal's documents ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const admin = createAdminClient();
  const membership = await loadDealMembership(admin, dealId, user.id);
  if (!membership) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  const isAdmin = !membership.side && (await supabase.from("profiles").select("role").eq("id", user.id).single()).data?.role === "admin";
  if (!membership.side && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await admin
    .from("deal_documents")
    .select("id, uploader_side, file_name, file_size, mime_type, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ documents: data ?? [] });
}

// ── Upload a document into the deal ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const { success: withinRate } = await uploadRatelimit.limit(`upload:${user.id}`);
  if (!withinRate) return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "multipart/form-data body required" }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  const dealId = formData.get("dealId") as string | null;
  if (!file || !dealId) return NextResponse.json({ error: "file and dealId required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is over 10 MB." }, { status: 413 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "That file type can't be uploaded. PDF, images and Office files work." }, { status: 415 });

  const admin = createAdminClient();
  const membership = await loadDealMembership(admin, dealId, user.id);
  if (!membership || !membership.side) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const safeName = file.name.slice(0, 200);
  const path = `${dealId}/${crypto.randomUUID()}`;

  const { error: uploadError } = await admin.storage
    .from("deal-documents")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });

  const { data: row, error: insertError } = await admin
    .from("deal_documents")
    .insert({
      deal_id: dealId,
      startup_id: membership.deal.startup_id,
      investor_id: membership.deal.investor_id,
      uploader_id: user.id,
      uploader_side: membership.side,
      file_path: path,
      file_name: safeName,
      file_size: file.size,
      mime_type: file.type,
    })
    .select("id, uploader_side, file_name, file_size, mime_type, created_at")
    .single();

  if (insertError || !row) {
    await admin.storage.from("deal-documents").remove([path]);
    return NextResponse.json({ error: "Could not save the document." }, { status: 500 });
  }

  // Notify the other side that a document landed in the room.
  const other = membership.side === "startup" ? membership.investorOwner : membership.startupOwner;
  if (other) {
    await notifyUsers([other], {
      type: "doc_request",
      title: `New deal document — ${safeName}`,
      body: `The other side added a document to your shared data room.`,
      href: `/deals?deal=${dealId}`,
    }).catch(() => {});
  }

  return NextResponse.json({ document: row });
}
