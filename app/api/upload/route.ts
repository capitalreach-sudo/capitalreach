import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const startupId = formData.get("startupId") as string;
  const docType = formData.get("type") as string;
  const label = formData.get("label") as string;
  const requiresNda = formData.get("requiresNda") === "true";

  if (!file || !startupId) {
    return NextResponse.json({ error: "File and startupId required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Verify startup ownership
  const { data: startup } = await adminClient
    .from("startups")
    .select("id, subscription_tier")
    .eq("id", startupId)
    .eq("owner_id", user.id)
    .single();

  if (!startup) return NextResponse.json({ error: "Startup not found or not owned by you" }, { status: 403 });

  // Starter plan: max 3 documents
  if (startup.subscription_tier === "starter") {
    const { count } = await adminClient
      .from("startup_documents")
      .select("*", { count: "exact", head: true })
      .eq("startup_id", startupId);
    if ((count || 0) >= 3) {
      return NextResponse.json({ error: "Starter plan allows up to 3 documents. Upgrade to Growth for unlimited." }, { status: 403 });
    }
  }

  // Validate file type
  const allowedTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "video/mp4"];
  if (!allowedTypes.some(t => file.type === t)) {
    return NextResponse.json({ error: "Only PDF, XLSX, and MP4 files are allowed" }, { status: 400 });
  }

  // Max file size: 50MB
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "File size exceeds 50MB limit" }, { status: 400 });
  }

  const ext = file.name.split(".").pop();
  const filePath = `${startupId}/${docType}-${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { data: uploadData, error: uploadError } = await adminClient.storage
    .from("startup-assets")
    .upload(filePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Get signed URL (valid 1 year)
  const { data: signedUrlData } = await adminClient.storage
    .from("startup-assets")
    .createSignedUrl(filePath, 365 * 24 * 60 * 60);

  const fileUrl = signedUrlData?.signedUrl || uploadData.path;

  // Save document record
  const { data: doc } = await adminClient
    .from("startup_documents")
    .insert({
      startup_id: startupId,
      type: docType || "other",
      file_url: fileUrl,
      label: label || file.name,
      requires_nda: requiresNda,
    })
    .select()
    .single();

  return NextResponse.json({ success: true, document: doc });
}
