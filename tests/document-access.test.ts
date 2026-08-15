import { describe, it, expect } from "vitest";
import { mayOpenDocument, stripLockedUrl } from "../lib/document-access";

const openDoc = { requires_nda: false, file_url: "https://example.com/deck.pdf" };
const ndaDoc = { requires_nda: true, file_url: "https://example.com/financials.pdf" };

const base = { isOwnerOrAdmin: false, isInvestor: true, startupRequiresNda: true, ndaSigned: false };

describe("mayOpenDocument", () => {
  it("owner and admin always open, even NDA-gated documents unsigned", () => {
    expect(mayOpenDocument(ndaDoc, { ...base, isOwnerOrAdmin: true })).toBe(true);
  });

  it("anonymous (not an investor) is blocked from everything", () => {
    expect(mayOpenDocument(openDoc, { ...base, isInvestor: false })).toBe(false);
    expect(mayOpenDocument(ndaDoc, { ...base, isInvestor: false })).toBe(false);
  });

  it("NDA gate needs all three: doc flagged, listing requires, not signed", () => {
    expect(mayOpenDocument(ndaDoc, base)).toBe(false);
    expect(mayOpenDocument(ndaDoc, { ...base, ndaSigned: true })).toBe(true);
    // Listing doesn't demand an NDA: the per-doc flag alone doesn't lock.
    expect(mayOpenDocument(ndaDoc, { ...base, startupRequiresNda: false })).toBe(true);
    expect(mayOpenDocument(openDoc, base)).toBe(true);
  });

  it("null requires_nda counts as not gated", () => {
    expect(mayOpenDocument({ requires_nda: null }, base)).toBe(true);
  });
});

describe("stripLockedUrl", () => {
  it("locked documents carry an empty URL — the metadata stays, the URL goes", () => {
    const stripped = stripLockedUrl(ndaDoc, base);
    expect(stripped.locked).toBe(true);
    expect(stripped.file_url).toBe("");
    // The point of the whole change: a locked payload must not contain the URL
    // anywhere, or the padlock is a decoration.
    expect(JSON.stringify(stripped)).not.toContain("financials.pdf");
  });

  it("allowed documents keep their URL", () => {
    const kept = stripLockedUrl(ndaDoc, { ...base, ndaSigned: true });
    expect(kept.locked).toBe(false);
    expect(kept.file_url).toBe(ndaDoc.file_url);
  });
});
