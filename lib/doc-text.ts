import { createAdminClient } from "@/lib/supabase-server";

/**
 * C29: text extraction for AI due diligence.
 *
 * The diligence route used to select the startup's documents and then throw
 * them away — the "AI report" never read a single file it was standing next
 * to. This pulls the bytes out of storage and turns the readable ones into
 * plain text the model can actually reason over.
 *
 * Deliberate limits:
 *  · only documents the CALLER is entitled to open (the caller decides that
 *    and passes the filtered list — this module never widens access);
 *  · PDFs and plain text only. A spreadsheet or a slide deck in .pptx is not
 *    silently half-parsed into misleading fragments;
 *  · hard caps per document and in total, so one 300-page PDF cannot blow
 *    the context window or the bill.
 */
export const MAX_CHARS_PER_DOC = 12_000;
export const MAX_CHARS_TOTAL = 40_000;
const MAX_BYTES_PER_DOC = 15 * 1024 * 1024;

export interface ExtractableDoc {
  id: string;
  label: string;
  type: string;
  file_url: string;
}

export interface ExtractedDoc {
  label: string;
  type: string;
  text: string;
  truncated: boolean;
}

function storagePathFromUrl(fileUrl: string): string | null {
  // Public URLs look like .../storage/v1/object/public/startup-assets/<path>
  const marker = "/startup-assets/";
  const i = fileUrl.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(fileUrl.slice(i + marker.length).split("?")[0]);
}

async function pdfToText(buf: Buffer): Promise<string> {
  // Imported by its inner path: pdf-parse's index runs a debug harness when
  // it thinks it is the entry module, which throws in a bundled server.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const parse = (mod as unknown as { default?: (b: Buffer) => Promise<{ text: string }> }).default
    ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
  const out = await parse(buf);
  return out?.text ?? "";
}

/** Collapses the whitespace soup PDF extraction produces. */
function tidy(text: string): string {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractDocuments(docs: ExtractableDoc[]): Promise<{ extracted: ExtractedDoc[]; skipped: string[] }> {
  const admin = createAdminClient();
  const extracted: ExtractedDoc[] = [];
  const skipped: string[] = [];
  let budget = MAX_CHARS_TOTAL;

  for (const d of docs) {
    if (budget <= 0) { skipped.push(d.label); continue; }
    const path = storagePathFromUrl(d.file_url);
    const lower = (d.file_url.split("?")[0] || "").toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isText = /\.(txt|md|csv)$/.test(lower);
    if (!path || (!isPdf && !isText)) { skipped.push(d.label); continue; }

    try {
      const { data, error } = await admin.storage.from("startup-assets").download(path);
      if (error || !data) { skipped.push(d.label); continue; }
      const buf = Buffer.from(await data.arrayBuffer());
      if (buf.byteLength > MAX_BYTES_PER_DOC) { skipped.push(d.label); continue; }

      const raw = isPdf ? await pdfToText(buf) : buf.toString("utf8");
      const text = tidy(raw);
      if (!text) { skipped.push(d.label); continue; }

      const cap = Math.min(MAX_CHARS_PER_DOC, budget);
      const clipped = text.slice(0, cap);
      budget -= clipped.length;
      extracted.push({ label: d.label, type: d.type, text: clipped, truncated: clipped.length < text.length });
    } catch {
      skipped.push(d.label);
    }
  }
  return { extracted, skipped };
}
