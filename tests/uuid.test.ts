import { describe, it, expect } from "vitest";
import { isUuid } from "@/lib/utils";

/**
 * isUuid guards every route that takes a user-supplied id. Before it existed,
 * a malformed uuid reached Postgres and came back as a raw 22P02 500 from
 * /api/watchlist (found in the 2026-08-04 sweep).
 */
describe("isUuid", () => {
  it("accepts real uuids in any case", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isUuid("30F57664-D4AE-4F91-A4D9-315E14885D93")).toBe(true);
  });

  it("rejects everything else", () => {
    for (const bad of [
      "not-a-uuid", "", null, undefined, 42,
      "00000000-0000-4000-8000-00000000000",   // one short
      "00000000-0000-4000-8000-0000000000000", // one long
      "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
      "00000000000040008000000000000000",      // no dashes
      "'; drop table deals; --",
    ]) {
      expect(isUuid(bad), String(bad)).toBe(false);
    }
  });
});
