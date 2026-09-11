import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Who took this copy, written into the copy.
 *
 * A data room hands confidential material to people who are, at that moment,
 * strangers with a signature on a file. The NDA log already records that a
 * named investor opened a document; it cannot say anything at all about the
 * PDF that later turns up on somebody else's desk, because every copy served
 * was byte-identical. Stamping makes each copy distinguishable, so a leaked
 * deck resolves to one download and therefore one person.
 *
 * Everything here is best-effort by design. The caller serves the original
 * when any of it fails: an investor who cannot read the deck is a real cost
 * paid today, and an unstamped copy is a hypothetical cost paid only if that
 * particular file ever leaks.
 */

/**
 * Crockford base32 with the vowels removed -- so a stamp can never come out
 * spelling a word, which is what gets an id quoted as a word and mistyped
 * back -- and without the two pairs that a person reading a stamp off a
 * printed page confuses: O against 0 and I against 1.
 */
export const WATERMARK_ALPHABET = "23456789BCDFGHJKMNPQRSTVWXYZ";
export const WATERMARK_LENGTH = 6;

/**
 * How much of a file will be pulled into memory to stamp it. Above this the
 * caller falls back to the redirect, unstamped: pdf-lib holds the source
 * bytes, the parsed document and the output at once, so a large file costs
 * several times its own size in a function with a fixed memory ceiling, and
 * running that ceiling out fails the download outright.
 */
export const MAX_WATERMARK_BYTES = 20 * 1024 * 1024;

const FOOTER_SIZE = 7;
const FOOTER_MARGIN = 18;
/** 40 percent grey: legible on a printout and on a photograph of a screen,
 *  without competing with the founder's own footers. */
const GREY = rgb(0.4, 0.4, 0.4);
const CENTRE_OPACITY = 0.06;
const CENTRE_WIDTH_SHARE = 0.7;
const CENTRE_SIZE_MIN = 24;
const CENTRE_SIZE_MAX = 180;

/**
 * A fresh id. Callers MUST mint one per download and never derive it from the
 * viewer or the document: document_downloads.watermark_id is unique, so a
 * derived id collides with itself on the second download, and an id shared by
 * several downloads names a set of people, which answers nothing.
 */
export function mintWatermarkId(): string {
  // Rejection sampling rather than `byte % length`: 256 is not a multiple of
  // 28, so a plain modulo would draw the first four symbols more often than
  // the rest and shrink the space the id is supposed to cover.
  const limit = 256 - (256 % WATERMARK_ALPHABET.length);
  let out = "";
  while (out.length < WATERMARK_LENGTH) {
    const draw = randomBytes(WATERMARK_LENGTH * 2);
    for (let i = 0; i < draw.length && out.length < WATERMARK_LENGTH; i++) {
      if (draw[i] >= limit) continue;
      out += WATERMARK_ALPHABET[draw[i] % WATERMARK_ALPHABET.length];
    }
  }
  return out;
}

export interface WatermarkStamp {
  /** From mintWatermarkId, already written to document_downloads. */
  id: string;
  /** The person, as the platform knows them. */
  name: string | null;
  email: string | null;
  /** Defaults to now; passed in so the stamp and the ledger row agree. */
  at?: Date;
}

/**
 * The footer line. Missing parts are dropped rather than printed as a gap:
 * a stamp reading "CapitalReach . . . 2026-09-11 . XXXXXX" invites the reader
 * to think the record is incomplete, when the id alone already resolves it.
 */
export function watermarkFooter(stamp: WatermarkStamp): string {
  const at = stamp.at ?? new Date();
  return [
    "CapitalReach",
    stamp.name?.trim() || null,
    stamp.email?.trim() || null,
    at.toISOString().slice(0, 10),
    stamp.id,
  ].filter(Boolean).join(" · ");
}

/**
 * pdf-lib's standard fonts encode WinAnsi and THROW on anything outside it, so
 * one investor with a Japanese display name would otherwise take the whole
 * stamp down. Unrepresentable characters become "?" -- visibly redacted, so
 * nobody reads the footer as the person's actual name, while the email and the
 * id beside it still identify them.
 */
function winAnsiSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xa0 || ch === "\t" || ch === "\n" || ch === "\r") out += " ";
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff)) out += ch;
    else out += "?";
  }
  return out;
}

function centreSize(width: number, unitWidth: number): number {
  if (unitWidth <= 0) return CENTRE_SIZE_MIN;
  const fitted = (width * CENTRE_WIDTH_SHARE) / unitWidth;
  return Math.max(CENTRE_SIZE_MIN, Math.min(CENTRE_SIZE_MAX, fitted));
}

/**
 * Every page stamped, or null.
 *
 * Null is the ordinary outcome for an encrypted file (PDFDocument.load refuses
 * one, which is the correct refusal: an owner password means the founder asked
 * for the bytes not to be rewritten), a file that is a PDF only by extension,
 * and anything pdf-lib cannot re-serialise. The caller serves the original on
 * null and still records the download.
 */
export async function stampPdf(bytes: Uint8Array, stamp: WatermarkStamp): Promise<Uint8Array | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const footer = winAnsiSafe(watermarkFooter(stamp));
    const centre = winAnsiSafe(stamp.id);
    const footerWidth = font.widthOfTextAtSize(footer, FOOTER_SIZE);
    const centreUnitWidth = font.widthOfTextAtSize(centre, 1);

    const pages = pdf.getPages();
    if (pages.length === 0) return null;
    for (const page of pages) {
      const { width, height } = page.getSize();
      page.drawText(footer, {
        x: Math.max(FOOTER_MARGIN, (width - footerWidth) / 2),
        y: FOOTER_MARGIN,
        size: FOOTER_SIZE,
        font,
        color: GREY,
      });
      const size = centreSize(width, centreUnitWidth);
      page.drawText(centre, {
        x: Math.max(0, (width - centreUnitWidth * size) / 2),
        y: (height - size * 0.7) / 2,
        size,
        font,
        color: GREY,
        opacity: CENTRE_OPACITY,
      });
    }
    return await pdf.save();
  } catch (err) {
    console.warn("[watermark] could not stamp:", err instanceof Error ? err.message : err);
    return null;
  }
}
