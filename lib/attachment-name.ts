import { maskContactDetails, type MaskedKind } from "@/lib/message-safety";

/**
 * The name an attachment is shown and downloaded under.
 *
 * A filename is a message. "call-me-+49-170-1234567.pdf" carried a phone
 * number past the masking layer in full view, because the mask only ever ran
 * over the body. But maskContactDetails substitutes a whole sentence, and a
 * sentence in the middle of a filename is not a filename -- so the offending
 * run is REMOVED here rather than replaced, and the rest of the name, which
 * is usually the part that says what the file is, survives.
 *
 * Only the display name is touched. The stored object path is a UUID that
 * never derives from this, so a sanitised name cannot make a file
 * undownloadable.
 */

// message-safety keeps its placeholder private. Masking a probe reads the
// current one back instead of restating the string here, where a change to it
// would go unnoticed and leave the sentence embedded in filenames.
const PLACEHOLDER = maskContactDetails("probe@example.com").text;

const FALLBACK_STEM = "attachment";
const EDGE_SEPARATORS = /^[\s._+-]+|[\s._+-]+$/g;

export interface SanitisedAttachmentName {
  /** What the recipient sees, and what the download is named. */
  name: string;
  /** What was taken out, in the same kinds the body mask reports. */
  masked: MaskedKind[];
}

export function sanitiseAttachmentName(raw: string): SanitisedAttachmentName {
  // Control characters would break the link label rather than read as a name.
  const name = (raw ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 200);
  if (!name) return { name: FALLBACK_STEM, masked: [] };

  // Split the extension off first: it is what tells the recipient whether
  // they are opening a deck or a spreadsheet, and it must survive whatever
  // happens to the stem. It also keeps the mask away from a trailing ".2026"
  // that is an extension rather than part of a number.
  const dot = name.lastIndexOf(".");
  const hasExt = dot > 0 && /^[A-Za-z0-9]{1,8}$/.test(name.slice(dot + 1));
  const ext = hasExt ? name.slice(dot) : "";
  const stem = hasExt ? name.slice(0, dot) : name;

  // Filenames separate words with hyphens; prose separates them with spaces,
  // and the mask reads prose. An email local part may contain a hyphen, so
  // "Q3-report-jane@acme.com" reads as one enormous address and the whole
  // descriptive half of the name goes with it. Spaces bound the address
  // without hiding a phone number, whose own pattern already spans them.
  const { text, masked } = maskContactDetails(stem.replace(/[_-]+/g, " "));
  if (!masked.length) return { name, masked: [] };

  const kept = text
    .split(PLACEHOLDER)
    .map((part) => part.replace(EDGE_SEPARATORS, "").replace(/\s+/g, "-"))
    .filter(Boolean);

  return { name: (kept.join("-") || FALLBACK_STEM) + ext, masked };
}
