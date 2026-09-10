import { describe, it, expect } from "vitest";
import { sanitiseAttachmentName } from "../lib/attachment-name";

/**
 * The filename was the one string in a message that reached the other side
 * unmasked. What matters here is both halves of that: it now withholds, and
 * it still leaves an ordinary filename alone -- rewriting "Q3-2026-deck.pdf"
 * would be the worse failure of the two.
 */
describe("sanitiseAttachmentName", () => {
  it("leaves an ordinary filename exactly as it was", () => {
    for (const n of [
      "Series-A-deck.pdf",
      "Q3-2026-financials.xlsx",
      "cap-table-2026-09-15.csv",
      "raise-2000000-at-8000000-pre.pdf",
      "notes",
    ]) {
      expect(sanitiseAttachmentName(n)).toEqual({ name: n, masked: [] });
    }
  });

  it("takes a phone number out and keeps the rest recognisable", () => {
    const r = sanitiseAttachmentName("call-me-+49-170-1234567.pdf");
    expect(r.name).toBe("call-me.pdf");
    expect(r.masked).toContain("phone");
  });

  it("takes an email out from the middle, keeping both sides", () => {
    const r = sanitiseAttachmentName("Q3-report-jane@acme.com-v2.xlsx");
    expect(r.name).toBe("Q3-report-v2.xlsx");
    expect(r.masked).toContain("email");
  });

  it("never leaves the placeholder sentence in a filename", () => {
    const r = sanitiseAttachmentName("reach me at jane@acme.com.pdf");
    expect(r.name).not.toContain("withheld");
    expect(r.name).not.toContain("[");
  });

  it("keeps the extension when the whole name was contact details", () => {
    const r = sanitiseAttachmentName("+491701234567.pdf");
    expect(r.name).toBe("attachment.pdf");
    expect(r.masked).toContain("phone");
  });

  it("handles a name with no extension", () => {
    expect(sanitiseAttachmentName("whatsapp +44 7700 900123").name).toBe("whatsapp");
  });

  it("does not treat the extension as part of a number", () => {
    const r = sanitiseAttachmentName("2026-09.pdf");
    expect(r.name).toBe("2026-09.pdf");
    expect(r.masked).toEqual([]);
  });

  it("strips control characters that would break the link label", () => {
    expect(sanitiseAttachmentName("deck\n\tv2.pdf").name).toBe("deck v2.pdf");
  });

  it("survives an empty name", () => {
    expect(sanitiseAttachmentName("").name).toBe("attachment");
  });
});
