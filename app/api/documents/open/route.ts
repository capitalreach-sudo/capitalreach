import { NextRequest, NextResponse } from "next/server";
import { recordDisclosure } from "@/lib/nda-record";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { mayOpenDocument } from "@/lib/document-access";
import { investorGate } from "@/lib/plan-gate";
import { isUuid } from "@/lib/utils";
import { evaluateGate, gateRefusal, getGateConfig, investorGateSubject, type GateVerdict } from "@/lib/trust-gates";
import { MAX_WATERMARK_BYTES, mintWatermarkId, stampPdf } from "@/lib/watermark";

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
 *
 * An investor's copy is also stamped, which is why that one case streams bytes
 * instead of redirecting: a redirect hands over the stored object, and the
 * stored object is the same for everybody. Every other viewer still redirects,
 * and every gate above runs before any of this.
 */
function storagePathFrom(fileUrl: string): string | null {
  // Rows written before this route store a full signed URL; newer rows may
  // store the bare path. Both resolve to the object path in startup-assets.
  if (!/^https?:\/\//.test(fileUrl)) return fileUrl || null;
  const m = fileUrl.match(/\/object\/sign\/startup-assets\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** Quotes and everything else that could break out of the header are dropped
 *  rather than escaped; the label is founder-typed free text. */
function pdfFilename(label: string | null): string {
  const stem = (label ?? "")
    .replace(/[^A-Za-z0-9 ._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "document";
  return /\.pdf$/i.test(stem) ? stem : `${stem}.pdf`;
}

/**
 * The ledger row, written BEFORE the copy is served so that every stamp in
 * circulation resolves to a row. A row with no stamp in the wild is only a
 * download that could not be marked; a stamp with no row is a mark nobody can
 * trace, which is the one outcome this table exists to prevent.
 *
 * Returns the id that was actually recorded, or null.
 */
async function recordDownload(
  admin: AdminClient,
  row: { documentId: string; startupId: string; investorId: string; ip: string | null; at: Date },
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const watermarkId = mintWatermarkId();
    const { error } = await admin.from("document_downloads").insert({
      document_id: row.documentId,
      startup_id: row.startupId,
      investor_id: row.investorId,
      watermark_id: watermarkId,
      downloaded_at: row.at.toISOString(),
      ip_address: row.ip,
    });
    if (!error) return watermarkId;
    // 23505 is the unique index on watermark_id. Nothing but another draw can
    // clear it, and every other code is a reason to stop asking.
    if (error.code !== "23505") {
      console.warn("[documents/open] download not recorded:", error.message);
      return null;
    }
  }
  console.warn("[documents/open] download not recorded: watermark id kept colliding");
  return null;
}

/** The body, or null once it passes `cap`. The remainder is abandoned rather
 *  than drained: a function with a fixed memory ceiling cannot hold a file it
 *  has already decided it will not stamp. */
async function readCapped(res: Response, cap: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) {
      try { await reader.cancel(); } catch {}
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * The stamped copy, or null when the caller should fall back to the redirect
 * it has always used.
 *
 * Null is a normal outcome, not an error path to be tightened later: a
 * traceability mark that stops a paid-up investor reading a deck costs the
 * platform more than an unmarked copy ever will. The download is recorded
 * either way.
 */
async function serveWatermarked(
  admin: AdminClient,
  args: {
    signedUrl: string;
    path: string;
    documentId: string;
    startupId: string;
    investorId: string;
    name: string | null;
    email: string | null;
    label: string | null;
    ip: string | null;
  },
): Promise<NextResponse | null> {
  const at = new Date();
  const watermarkId = await recordDownload(admin, { ...args, at });
  if (!watermarkId) return null;

  // Branched on the stored path rather than on the bytes: a spreadsheet or an
  // mp4 put through a PDF writer comes back corrupt, and the investor is the
  // one who finds out.
  if (!/\.pdf$/i.test(args.path.split("?")[0])) return null;

  let bytes: Buffer;
  let upstreamType = "application/pdf";
  try {
    const res = await fetch(args.signedUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_WATERMARK_BYTES) {
      try { await res.body?.cancel(); } catch {}
      return null;
    }
    upstreamType = res.headers.get("content-type") || upstreamType;
    // Counted while reading rather than trusted from the header: a chunked
    // response declares no length at all, and arrayBuffer() on one would hold
    // whatever arrives, which is the thing the cap exists to stop.
    const capped = await readCapped(res, MAX_WATERMARK_BYTES);
    if (!capped) return null;
    bytes = capped;
  } catch (err) {
    console.warn("[documents/open] object unreadable for stamping:", err instanceof Error ? err.message : err);
    return null;
  }

  // Streamed rather than redirected when stamping fails: the bytes are already
  // in hand, and the signed URL is only good for sixty seconds of which the
  // fetch and the parse have just spent some.
  const stamped = await stampPdf(bytes, { id: watermarkId, name: args.name, email: args.email, at });
  const body = stamped ?? bytes;
  // Detached from its view: a Uint8Array over an ArrayBufferLike is not a
  // BodyInit under this tsconfig, and pdf-lib hands back exactly that.
  const payload = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return new NextResponse(payload, {
    headers: {
      "Content-Type": stamped ? "application/pdf" : upstreamType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename="${pdfFilename(args.label)}"`,
      // These bytes name one person. A CDN or a proxy holding them would hand
      // one investor's stamped copy to the next reader, under their name.
      "Cache-Control": "no-store, private",
      // vercel.json sends X-Frame-Options: DENY on every path, which until now
      // never reached a document because the redirect ended on storage. The
      // listing page frames this route in its own PDF viewer, and a response
      // carrying frame-ancestors makes browsers ignore the older header while
      // still refusing every origin but ours.
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const shareToken = (req.nextUrl.searchParams.get("share") ?? "").slice(0, 64) || null;
  if (!isUuid(id)) return NextResponse.json({ error: "Bad document id" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const { data: doc } = await admin.from("startup_documents")
    .select("id, startup_id, file_url, requires_nda, label").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: startup } = await admin.from("startups")
    .select("id, owner_id, status, require_nda").eq("id", doc.startup_id).maybeSingle();
  if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let isOwnerOrAdmin = false;
  let investorId: string | null = null;
  let canViewDocuments = false;
  let ndaSigned = false;
  // Read for the stamp. A copy marked with an id alone traces to a row an
  // admin has to look up; a copy marked with the name and the address traces
  // to the person in the hand of whoever is holding the leaked file.
  let viewerName: string | null = null;
  let viewerEmail: string | null = null;
  // Held rather than returned on the spot so a suspended or removed listing
  // still answers 404 first, exactly as it did before the gate existed.
  let gateRefused: Extract<GateVerdict, { allowed: false }> | null = null;
  if (user) {
    if (user.id === startup.owner_id) isOwnerOrAdmin = true;
    else {
      const [{ data: prof }, { data: inv }] = await Promise.all([
        admin.from("profiles").select("role, suspended_at, full_name, email").eq("id", user.id).maybeSingle(),
        admin.from("investors").select("id, display_name, firm_name").eq("owner_id", user.id).maybeSingle(),
      ]);
      if (prof?.suspended_at) return NextResponse.json({ error: "Account suspended" }, { status: 403 });
      if (prof?.role === "admin") isOwnerOrAdmin = true;
      investorId = inv?.id ?? null;
      viewerName = prof?.full_name?.trim() || inv?.display_name?.trim() || inv?.firm_name?.trim() || null;
      viewerEmail = prof?.email?.trim() || null;
      // Tier gate: viewDocuments is a paid capability (lib/access.ts), and the
      // pricing page sells it that way. Derived through investorGate, so launch
      // mode lifts it like every other paywall while platform launch mode is on.
      if (investorId && !isOwnerOrAdmin) {
        canViewDocuments = (await investorGate(user.id)).viewDocuments;
        // Trust gate: a SECOND, independent check beside the tier gate above.
        // The room is where the confidential material actually leaves the
        // founder's hands, so it asks for an identified counterparty (level 2)
        // as well as a paid plan. Only reachable here -- the owner and admin
        // branches above never enter this block, and a share-token holder has
        // no investor entity to gate.
        const gateSubject = await investorGateSubject(user.id);
        if (gateSubject) {
          const verdict = evaluateGate("dataroom", gateSubject, await getGateConfig());
          if (!verdict.allowed) gateRefused = verdict;
        }
      }
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
  // Distinguishable from the tier refusal below ("Locked"): this one names the
  // rung and where to earn it, because it is fixable by the viewer.
  if (gateRefused) return NextResponse.json(gateRefusal(gateRefused), { status: 403 });

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
    // A share-token grant keeps its own path: the founder minted it, no tier
    // is involved.
    canViewDocuments: canViewDocuments || shareGrantsDocs,
    startupRequiresNda: !!startup.require_nda,
    ndaSigned,
  });
  if (!allowed) return NextResponse.json({ error: "Locked" }, { status: 403 });

  const path = storagePathFrom(doc.file_url);
  if (!path) return NextResponse.json({ error: "File missing" }, { status: 404 });
  const { data: signed } = await admin.storage.from("startup-assets").createSignedUrl(path, 60);
  if (!signed?.signedUrl) return NextResponse.json({ error: "File missing" }, { status: 404 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  // The record a founder needs on the day somebody copies their idea: not
  // "an investor had access" but this named person opened this document at
  // this moment. Owners and admins reading their own room are not disclosures.
  if (investorId && !isOwnerOrAdmin) {
    await recordDisclosure({
      startupId: doc.startup_id,
      investorId,
      itemType: "document",
      itemId: doc.id,
      itemLabel: doc.label ?? null,
      ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
    });
    // Only the investor path is stamped. An owner or an admin reading the room
    // is not a disclosure and has no investor row to hang the ledger off, and
    // a share-token holder has no investor row at all.
    const watermarked = await serveWatermarked(admin, {
      signedUrl: signed.signedUrl,
      path,
      documentId: doc.id,
      startupId: doc.startup_id,
      investorId,
      name: viewerName,
      email: viewerEmail,
      label: doc.label ?? null,
      ip,
    });
    if (watermarked) return watermarked;
  }
  return NextResponse.redirect(signed.signedUrl, 302);
}
