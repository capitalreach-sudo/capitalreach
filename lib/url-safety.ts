/**
 * A user-supplied URL, kept only if it resolves to http(s).
 *
 * These values (website, linkedin_url, twitter_url) are rendered into anchor
 * `href` on public listing and investor pages. Every render carries
 * target="_blank" rel="noopener noreferrer", which neutralizes a
 * `javascript:`/`data:` href in current browsers -- but nothing enforced the
 * scheme on write, so a render site that forgot rel, or a browser that reverts
 * that policy, would be stored XSS. This enforces it at the source.
 *
 * A scheme-less value ("example.com", what people actually type) is treated as
 * https rather than rejected, so the guard hardens the dangerous case without
 * regressing the common one. Anything that is not http(s) after that
 * (javascript:, data:, mailto:, a malformed string) becomes null.
 */
export function httpUrlOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let s = v.trim();
  if (!s) return null;
  // No scheme -> assume https, so a bare domain is not parsed as some other
  // (possibly dangerous) scheme or as an opaque URL.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Sanitize the known URL fields on a form patch in place. Leaves absent keys
 *  untouched (so a partial update does not null a field the user did not send);
 *  an explicitly-sent field that is empty/invalid becomes null. */
export function sanitizeUrlFields(
  patch: Record<string, unknown>,
  fields: readonly string[] = ["website", "linkedin_url", "twitter_url"],
): void {
  for (const f of fields) {
    if (f in patch) patch[f] = httpUrlOrNull(patch[f]);
  }
}
