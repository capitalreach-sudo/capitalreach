/**
 * May this viewer open this document? One rule, used by every surface that
 * serves document URLs.
 *
 * Until now the rule lived in the UI: the listing page and the deal portal
 * both sent `file_url` to the browser for every document and drew a padlock
 * over the ones the viewer "couldn't" open. Devtools reads what a padlock
 * hides -- an NDA gate that ships the URL anyway is a decoration, not a gate.
 * Callers now strip the URL server-side whenever this returns false; the
 * padlocked row still renders (the viewer should know the document exists and
 * what unlocking takes), it just carries nothing openable.
 */
export interface DocumentAccessContext {
  /** Owner of the listing or an admin: always allowed. */
  isOwnerOrAdmin: boolean;
  /** Viewer is a signed-in investor (any tier). Reading the data room is not a
   *  paid gate — evaluating a deal requires seeing the documents. Monetization
   *  lives in tools and volume, not in charging investors to look. */
  isInvestor: boolean;
  /** The listing demands an NDA before its gated documents. */
  startupRequiresNda: boolean;
  /** This viewer has a signed NDA with this startup. */
  ndaSigned: boolean;
}

export function mayOpenDocument(
  doc: { requires_nda: boolean | null },
  ctx: DocumentAccessContext,
): boolean {
  if (ctx.isOwnerOrAdmin) return true;
  // Anonymous visitors don't get the data room at all.
  if (!ctx.isInvestor) return false;
  // NDA-gated documents still require an accepted NDA — that gate is real.
  if (doc.requires_nda && ctx.startupRequiresNda && !ctx.ndaSigned) return false;
  return true;
}

/**
 * The same document, made safe for a browser: the stored URL (historically a
 * YEAR-long signed URL — a forwarded link kept working long after access was
 * revoked) never leaves the server. Allowed viewers get /api/documents/open,
 * which re-authorises and mints a 60-second URL per click; locked viewers get
 * nothing. `is_pdf` survives the swap so the client can still pick the
 * inline viewer without seeing the real URL.
 */
export function stripLockedUrl<T extends { id: string; requires_nda: boolean | null; file_url: string }>(
  doc: T,
  ctx: DocumentAccessContext,
  shareToken?: string | null,
): T & { locked: boolean; is_pdf: boolean } {
  const allowed = mayOpenDocument(doc, ctx);
  const share = shareToken ? `&share=${encodeURIComponent(shareToken)}` : "";
  return {
    ...doc,
    file_url: allowed ? `/api/documents/open?id=${doc.id}${share}` : "",
    locked: !allowed,
    is_pdf: /\.pdf(\?|$)/i.test(doc.file_url),
  };
}
