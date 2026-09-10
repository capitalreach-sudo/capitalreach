import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { CONFIDENTIALITY_MONTHS, ndaText } from "../lib/nda-text";
import { DISCLOSURE_ITEM_TYPES } from "../lib/nda-record";

/**
 * The two facts the NDA record rests on, both of which have already been wrong
 * once: that the text which gets hashed is the text the signer was shown, and
 * that a disclosure the code writes is a disclosure the database accepts.
 */

const MIGRATION = path.join(__dirname, "..", "supabase", "migrations", "113_gates_nda_and_introductions.sql");

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("nda text and its hash", () => {
  it("names the recipient in the document, so the bytes differ from an unnamed rendering", () => {
    const named = ndaText("Northwind", { name: "Jane Doe", entity: "Acme Capital" });
    const unnamed = ndaText("Northwind");
    expect(named).toContain("Jane Doe");
    expect(named).toContain("Acme Capital");
    expect(sha(named)).not.toBe(sha(unnamed));
  });

  it("is stable for the same company and recipient", () => {
    const a = ndaText("Northwind", { name: "Jane Doe", entity: null });
    const b = ndaText("Northwind", { name: "Jane Doe", entity: null });
    expect(sha(a)).toBe(sha(b));
  });

  it("states the term the stored expiry is computed from", () => {
    expect(ndaText("Northwind")).toContain(`${CONFIDENTIALITY_MONTHS} months from the date of`);
  });
});

describe("disclosure item vocabulary", () => {
  it("matches the CHECK constraint on nda_disclosures.item_type", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const check = sql.match(/item_type\s+text not null check \(item_type in\s*\(([^)]+)\)/);
    expect(check, "the CHECK constraint on item_type was not found").toBeTruthy();
    const allowed = Array.from(check![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    // A value outside this list is rejected by Postgres, and recordDisclosure
    // swallows the error: the item would be handed over with nothing logged.
    expect([...DISCLOSURE_ITEM_TYPES].sort()).toEqual(allowed.sort());
  });
});
