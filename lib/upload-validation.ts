/**
 * Sanitisation for user-supplied parts of a storage key.
 *
 * Both inputs reach /api/upload straight from the form and used to be
 * interpolated into the bucket path unchecked -- a type of "../../x" wrote
 * outside the startup's own prefix. Extracted from the route so the exact
 * containment behaviour is unit-tested rather than re-proven by hand.
 */

/** Must match the CHECK constraint on startup_documents.type. */
export const DOC_TYPES = ["pitch_deck", "financial_model", "cap_table", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export function sanitizeDocType(raw: unknown): DocType {
  return (DOC_TYPES as readonly string[]).includes(raw as string)
    ? (raw as DocType)
    : "other";
}

/**
 * The extension from a client filename, restricted to a short alphanumeric
 * run so a crafted name cannot steer the key. Anything else becomes "bin".
 */
export function sanitizeExtension(filename: string): string {
  const raw = filename.split(".").pop() ?? "";
  return /^[a-zA-Z0-9]{1,8}$/.test(raw) ? raw.toLowerCase() : "bin";
}

/** The full storage key. Everything variable in it is sanitised above. */
export function buildStoragePath(
  startupId: string,
  rawType: unknown,
  filename: string,
  now: number = Date.now()
): string {
  return `${startupId}/${sanitizeDocType(rawType)}-${now}.${sanitizeExtension(filename)}`;
}
