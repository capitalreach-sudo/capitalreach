import { describe, it, expect } from "vitest";
import { sanitizeDocType, sanitizeExtension, buildStoragePath, DOC_TYPES } from "@/lib/upload-validation";

describe("sanitizeDocType", () => {
  it("passes every constraint-listed type through", () => {
    for (const t of DOC_TYPES) expect(sanitizeDocType(t)).toBe(t);
  });
  it("collapses everything else to 'other'", () => {
    for (const bad of ["../../evil", "other/../../x", "DROP TABLE", "", null, undefined, 42]) {
      expect(sanitizeDocType(bad)).toBe("other");
    }
  });
});

describe("sanitizeExtension", () => {
  it("keeps short alphanumeric extensions, lowercased", () => {
    expect(sanitizeExtension("deck.PDF")).toBe("pdf");
    expect(sanitizeExtension("model.xlsx")).toBe("xlsx");
  });
  it("rejects traversal, separators, and missing extensions", () => {
    expect(sanitizeExtension("x.pdf/../../../etc/passwd")).toBe("bin");
    expect(sanitizeExtension("noextension")).toBe("bin");
    expect(sanitizeExtension("a.b/c")).toBe("bin");
    expect(sanitizeExtension("weird.exten$ion")).toBe("bin");
    expect(sanitizeExtension("toolong.abcdefghij")).toBe("bin");
  });
});

describe("buildStoragePath — containment", () => {
  // The property that matters: whatever the inputs, the key stays exactly one
  // level under the startup's own prefix.
  const HOSTILE: Array<[unknown, string]> = [
    ["pitch_deck", "deck.pdf"],
    ["../../evil", "deck.pdf"],
    ["other/../../x", "model.xlsx"],
    ["pitch_deck", "x.pdf/../../../etc/passwd"],
    ["DROP TABLE", "a.PDF"],
    [null, ""],
  ];
  for (const [type, name] of HOSTILE) {
    it(`contains type=${JSON.stringify(type)} name=${JSON.stringify(name)}`, () => {
      const p = buildStoragePath("startup-123", type, name, 1700000000000);
      expect(p.startsWith("startup-123/")).toBe(true);
      expect(p).not.toContain("..");
      expect(p.split("/").length).toBe(2);
    });
  }
});
