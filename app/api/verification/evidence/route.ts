import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isUuid } from "@/lib/utils";
import type { EvidenceKind } from "@/lib/trust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Evidence the applicant supplies: a document, or a placeholder for a check
 * that is not open yet.
 *
 * Everything here is service-role work. verification_evidence carries RLS with
 * no permissive policy (migration 111), so this handler is the only way an
 * applicant can attach anything -- and it proves twice over that they may:
 * they must own the case AND still own the subject the case names.
 *
 * The row stores the bucket-relative PATH, never a signed URL. A signed URL in
 * a row is a long-lived credential that revocation cannot claw back; the
 * reviewer's route mints a short-lived one per read instead. Same lesson as
 * app/api/upload/route.ts, and it matters more here: these are passports and
 * bank statements, not pitch decks.
 */

/** Private. Reviewers reach it through /api/admin/verification, never the web. */
const BUCKET = "verification-evidence";

/** Small on purpose: a registry extract is a few pages, not a data room. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Extension comes from the MIME type, never from the client's filename. */
const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Editing stops when the case reaches a reviewer: what they read must not
 *  change under them. A case sent back as needs_more is the applicant's again. */
const EDITABLE_STATUSES = ["draft", "needs_more"];

/** Kinds a person can satisfy by uploading a document. */
const UPLOAD_KINDS: EvidenceKind[] = [
  "company_registry", "director_authority", "bank_account",
  "accreditation", "revenue_proof", "fund_proof", "reference", "other",
];

/** Kinds that wait on a KYC vendor. No document is accepted for these. */
const VENDOR_KINDS: EvidenceKind[] = ["identity_document", "liveness"];

/** A filename is user text that a reviewer will read. Keep it short and inert. */
function safeFilename(raw: unknown): string {
  const name = typeof raw === "string" ? raw.split(/[\\/]/).pop() ?? "" : "";
  return name.replace(/[^\w. -]/g, "").slice(0, 120) || "document";
}

function safeNote(raw: unknown): string | null {
  const note = typeof raw === "string" ? raw.trim().slice(0, 300) : "";
  return note || null;
}

interface EvidenceView {
  id: string;
  kind: string;
  method: string;
  status: string;
  checkedAt: string | null;
  filename: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const { max, windowMs } = RATE.perHour(20);
  const limit = await dbRateLimit(user.id, "verification_evidence", max, windowMs);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads", messageKey: "verify.tooMany" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  // One handler, two body shapes: a document arrives as multipart, a reserved
  // vendor check as JSON. A JSON body through formData() throws, which used to
  // surface as a bare 500 in the sibling upload route.
  const isMultipart = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  let caseId: unknown;
  let kindRaw: unknown;
  let note: string | null;
  let file: File | null = null;

  if (isMultipart) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "multipart/form-data body required" }, { status: 400 });
    }
    caseId = form.get("caseId");
    kindRaw = form.get("kind");
    note = safeNote(form.get("note"));
    file = form.get("file") as File | null;
  } else {
    const body = await req.json().catch(() => ({}));
    caseId = body?.caseId;
    kindRaw = body?.kind;
    note = safeNote(body?.note);
  }

  if (!isUuid(caseId)) return NextResponse.json({ error: "caseId required" }, { status: 400 });

  const kind = kindRaw as EvidenceKind;
  const isUpload = UPLOAD_KINDS.includes(kind);
  const isVendor = VENDOR_KINDS.includes(kind);
  if (!isUpload && !isVendor) {
    // domain_control and email_domain are proven, not uploaded. Accepting a
    // screenshot for either would let a document stand in for a check the
    // server performs itself.
    return NextResponse.json(
      { error: "That evidence is not supplied here", messageKey: "verify.kindNotAccepted" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Never risk_score or risk_flags: revoked from client keys, and an applicant
  // must not learn their score through a route either.
  const { data: vcase } = await admin
    .from("verification_cases")
    .select("id, owner_id, subject_type, subject_id, status")
    .eq("id", caseId)
    .maybeSingle();
  // A case that is not theirs is a case that does not exist, so probing ids
  // tells an attacker nothing about which ones are real.
  if (!vcase || vcase.owner_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Owning the case is not enough: a listing that changed hands since the case
  // opened must not keep taking evidence from its previous owner.
  const subject = vcase.subject_type === "startup"
    ? await admin.from("startups").select("owner_id").eq("id", vcase.subject_id).maybeSingle()
    : await admin.from("investors").select("owner_id").eq("id", vcase.subject_id).maybeSingle();
  if (!subject.data || subject.data.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!EDITABLE_STATUSES.includes(vcase.status)) {
    return NextResponse.json(
      { error: "This application is with a reviewer", messageKey: "verify.readOnly" },
      { status: 409 },
    );
  }

  // One row per case and kind. A replacement updates the row rather than
  // stacking three versions of the same certificate for a reviewer to compare.
  const { data: existing } = await admin
    .from("verification_evidence")
    .select("id, storage_path")
    .eq("case_id", vcase.id)
    .eq("kind", kind)
    .maybeSingle();

  // ── The vendor placeholder ───────────────────────────────────────────────
  // No KYC vendor is connected. Rather than fake a passport check, the row is
  // created pending so the reviewer sees the applicant is waiting on us.
  if (isVendor) {
    if (existing) return NextResponse.json({ ok: true, evidence: await readBack(admin, existing.id) });

    const { data: created, error } = await admin
      .from("verification_evidence")
      .insert({
        case_id: vcase.id,
        kind,
        method: "vendor_kyc",
        status: "pending",
        detail: { reserved: true, ...(note ? { note } : {}) },
      })
      .select("id, kind, method, status, checked_at, detail")
      .single();
    if (error || !created) {
      console.error("verification evidence insert failed:", error);
      return NextResponse.json({ error: "Could not save that" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, evidence: toView(created) });
  }

  // ── The document ─────────────────────────────────────────────────────────
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "File required", messageKey: "verify.fileMissing" }, { status: 400 });
  }
  const ext = MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Unsupported file type", messageKey: "verify.fileType" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large", messageKey: "verify.fileTooLarge" }, { status: 400 });
  }

  // Nothing the client controls reaches the key: the case id is ours, the kind
  // is from the allowlist above, and the extension follows the MIME type.
  const path = `${vcase.id}/${kind}-${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();

  let upload = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error && /bucket not found/i.test(upload.error.message)) {
    // The bucket has no migration of its own -- storage buckets are not part
    // of the schema dump -- so create it private on first use rather than
    // failing an application because an environment was provisioned late.
    await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
    upload = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  }
  if (upload.error || !upload.data) {
    console.error("verification evidence upload failed:", upload.error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const row = {
    case_id: vcase.id,
    kind,
    method: "manual_upload",
    status: "pending",
    storage_path: upload.data.path,
    detail: { filename: safeFilename(file.name), size: file.size, ...(note ? { note } : {}) },
    // A replacement is an unread document. Leaving the old timestamp in place
    // would date a file uploaded a minute ago to the reviewer's last look at
    // the one it superseded -- the case comes back as needs_more precisely
    // because that reading no longer applies.
    checked_at: null,
  };

  const saved = existing
    ? await admin.from("verification_evidence").update(row).eq("id", existing.id)
        .select("id, kind, method, status, checked_at, detail").single()
    : await admin.from("verification_evidence").insert(row)
        .select("id, kind, method, status, checked_at, detail").single();

  if (saved.error || !saved.data) {
    // Take the orphan back out: a file in the bucket with no row pointing at
    // it is a document nobody can review and nobody can delete.
    console.error("verification evidence record failed:", saved.error);
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // The superseded file goes only after the row points at the new one.
  if (existing?.storage_path && existing.storage_path !== upload.data.path) {
    await admin.storage.from(BUCKET).remove([existing.storage_path]).catch(() => {});
  }

  return NextResponse.json({ ok: true, evidence: toView(saved.data) });
}

function toView(row: {
  id: string; kind: string; method: string; status: string;
  checked_at: string | null; detail: unknown;
}): EvidenceView {
  const detail = row.detail && typeof row.detail === "object" ? (row.detail as Record<string, unknown>) : {};
  return {
    id: row.id,
    kind: row.kind,
    method: row.method,
    status: row.status,
    checkedAt: row.checked_at,
    filename: typeof detail.filename === "string" ? detail.filename : null,
  };
}

async function readBack(admin: ReturnType<typeof createAdminClient>, id: string): Promise<EvidenceView | null> {
  const { data } = await admin
    .from("verification_evidence")
    .select("id, kind, method, status, checked_at, detail")
    .eq("id", id)
    .maybeSingle();
  return data ? toView(data) : null;
}
