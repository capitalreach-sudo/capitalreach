import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { mayOpenDocument } from "@/lib/document-access";
import { isUuid } from "@/lib/utils";

/**
 * Opening a data-room document, re-authorised at the moment of the click.
 *
 * Uploads used to store a signed URL valid for a YEAR and hand it to every
 * allowed viewer. Anyone who ever saw the link — or was forwarded it — kept
 * working access for a year, NDA or no NDA, revocation or none. A padlock in
 * front of a long-lived URL is a decoration.
 *
 * This route is the replacement: the browser only ever holds
 * /api/documents/open?id=…, and each open re-checks the world (viewer, NDA,
 * share grant, listing state) and mints a 60-second URL. Forward the link and
 * the recipient hits the same gate, as themselves.
 */
function storagePathFrom(fileUrl: string): string | null {
  // Rows written before this route store a full signed URL; newer rows may
  // store the bare path. Both resolve to the object path in startup-assets.
  if (!/^https?:\/\//.test(fileUrl)) return fileUrl || null;
  const m = fileUrl.match(/\/object\/sign\/startup-assets\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const shareToken = (req.nextUrl.searchParams.get("share") ?? "").slice(0, 64) || null;
  if (!isUuid(id)) return NextResponse.json({ error: "Bad document id" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const { data: doc } = await admin.from("startup_documents")
    .select("id, startup_id, file_url, requires_nda").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: startup } = await admin.from("startups")
    .select("id, owner_id, status, require_nda").eq("id", doc.startup_id).maybeSingle();
  if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let isOwnerOrAdmin = false;
  let investorId: string | null = null;
  let ndaSigned = false;
  if (user) {
    if (user.id === startup.owner_id) isOwnerOrAdmin = true;
    else {
      const [{ data: prof }, { data: inv }] = await Promise.all([
        admin.from("profiles").select("role, suspended_at").eq("id", user.id).maybeSingle(),
        admin.from("investors").select("id").eq("owner_id", user.id).maybeSingle(),
      ]);
      if (prof?.suspended_at) return NextResponse.json({ error: "Account suspended" }, { status: 403 });
      if (prof?.role === "admin") isOwnerOrAdmin = true;
      investorId = inv?.id ?? null;
      if (investorId && startup.require_nda) {
        const { data: nda } = await admin.from("nda_records")
          .select("signed_at").match({ startup_id: startup.id, investor_id: investorId }).maybeSingle();
        ndaSigned = !!nda?.signed_at;
      }
    }
  }
  // A suspended or removed listing keeps its room shut for everyone but the
  // owner and admins.
  if (!isOwnerOrAdmin && startup.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let shareGrantsDocs = false;
  if (shareToken && !investorId && !isOwnerOrAdmin) {
    const { data: share } = await admin.from("round_shares")
      .select("startup_id, grants_documents, expires_at, revoked_at")
      .eq("token", shareToken).maybeSingle();
    shareGrantsDocs = !!share
      && share.startup_id === startup.id
      && share.grants_documents
      && !share.revoked_at
      && (!share.expires_at || new Date(share.expires_at) > new Date());
  }

  const allowed = mayOpenDocument(doc, {
    isOwnerOrAdmin,
    isInvestor: !!investorId || shareGrantsDocs,
    startupRequiresNda: !!startup.require_nda,
    ndaSigned,
  });
  if (!allowed) return NextResponse.json({ error: "Locked" }, { status: 403 });

  const path = storagePathFrom(doc.file_url);
  if (!path) return NextResponse.json({ error: "File missing" }, { status: 404 });
  const { data: signed } = await admin.storage.from("startup-assets").createSignedUrl(path, 60);
  if (!signed?.signedUrl) return NextResponse.json({ error: "File missing" }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl, 302);
}
