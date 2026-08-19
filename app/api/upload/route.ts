import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";
import { buildAccessContext, getFounderDocumentsLimit } from "@/lib/access";
import { uploadRatelimit } from "@/lib/redis";
import { sanitizeDocType, buildStoragePath } from "@/lib/upload-validation";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 20/hour per user. See lib/redis.ts for why this exists separately from the
  // per-plan document allowance below.
  const { success: withinRate } = await uploadRatelimit.limit(`upload:${user.id}`);
  if (!withinRate) {
    return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }

  // A JSON or otherwise non-multipart body makes formData() throw, which
  // surfaced as a bare 500; answer 400 like any other malformed request.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data body required" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  const startupId = formData.get("startupId") as string;
  const docTypeRaw = formData.get("type") as string;
  const label = formData.get("label") as string;
  const requiresNda = formData.get("requiresNda") === "true";

  if (!file || !startupId) {
    return NextResponse.json({ error: "File and startupId required" }, { status: 400 });
  }

  // Sanitised in lib/upload-validation (unit-tested there): a type of
  // "../../x" once wrote outside the startup's own prefix.
  const docType = sanitizeDocType(docTypeRaw);

  const adminClient = createAdminClient();

  // Verify startup ownership
  const { data: startup } = await adminClient
    .from("startups")
    .select("id, subscription_tier")
    .eq("id", startupId)
    .eq("owner_id", user.id)
    .single();

  if (!startup) return NextResponse.json({ error: "Startup not found or not owned by you" }, { status: 403 });

  const { data: ownerProfile } = await adminClient
    .from("profiles")
    .select("id, role, subscription_tier, suspended, account_status")
    .eq("id", user.id)
    .maybeSingle();

  const { isLaunch } = await getLaunchStatus();
  // The startup's own tier governs listing features, not the owner profile's.
  const ctx = buildAccessContext(
    { ...(ownerProfile ?? { id: user.id, role: "startup" }), subscription_tier: startup.subscription_tier },
    isLaunch,
  );

  if (ctx.suspended) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  // Enforce the plan's document allowance. This previously only checked the
  // starter tier, so free accounts (allowance 0) could upload without limit.
  const docLimit = getFounderDocumentsLimit(ctx);
  if (docLimit !== Infinity) {
    const { count } = await adminClient
      .from("startup_documents")
      .select("*", { count: "exact", head: true })
      .eq("startup_id", startupId);
    if ((count || 0) >= docLimit) {
      return NextResponse.json({
        error: docLimit === 0
          ? "Document uploads require a paid plan. Upgrade to Starter to add documents."
          : `Your plan allows up to ${docLimit} documents. Upgrade to Growth for unlimited.`,
      }, { status: 403 });
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

  const filePath = buildStoragePath(startupId, docType, file.name);

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

  // Save document record. The error was previously discarded, so a failed
  // insert still returned { success: true, document: undefined } while the
  // file sat in the bucket with no row pointing at it. Report the failure and
  // take the orphan back out.
  const { data: doc, error: insertError } = await adminClient
    .from("startup_documents")
    .insert({
      startup_id: startupId,
      type: docType,
      file_url: fileUrl,
      label: (label || file.name).slice(0, 200),
      requires_nda: requiresNda,
    })
    .select()
    .single();

  if (insertError || !doc) {
    console.error("Document record insert failed:", insertError);
    await adminClient.storage.from("startup-assets").remove([filePath]);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // C28: an upload of this type fulfils every open request for it. Each
  // requester hears that what they asked for has arrived.
  try {
    const { data: open } = await adminClient.from("document_requests")
      .select("id, investor:investors(owner_id)")
      .match({ startup_id: startupId, doc_type: docType, status: "open" });
    if (open && open.length) {
      await adminClient.from("document_requests")
        .update({ status: "fulfilled", resolved_at: new Date().toISOString(), fulfilled_document_id: doc.id })
        .in("id", open.map((r) => r.id));
      const { data: st } = await adminClient.from("startups").select("name, slug").eq("id", startupId).maybeSingle();
      const { notifyUsers } = await import("@/lib/notify-user");
      const owners = Array.from(new Set(open.map((r) => (r.investor as unknown as { owner_id: string } | null)?.owner_id).filter((x): x is string => !!x)));
      if (owners.length) {
        await notifyUsers(owners, {
          type: "doc_request",
          title: `${st?.name ?? "A founder"} uploaded the document you requested`,
          body: (label || file.name).slice(0, 120),
          href: st ? `/startups/${st.slug}` : "/dashboard/investor",
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("doc-request auto-fulfil failed:", e);
  }

  return NextResponse.json({ success: true, document: doc });
}
