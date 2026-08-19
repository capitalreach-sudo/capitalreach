/**
 * pdf-parse ships no types. Only the inner module is imported (its index
 * runs a debug harness when it believes it is the entry point).
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult { text: string; numpages: number; info: unknown }
  const parse: (data: Buffer) => Promise<PdfParseResult>;
  export default parse;
}
