import { describe, it, expect } from "vitest";
import { atLeast } from "@/lib/admin-guard";

/**
 * E51. This one function decides whether an admin may end launch mode or
 * suspend every account on the platform, so it gets its own tests.
 */
describe("admin levels", () => {
  it("each level includes the ones below it", () => {
    expect(atLeast("owner", "support")).toBe(true);
    expect(atLeast("owner", "operator")).toBe(true);
    expect(atLeast("operator", "support")).toBe(true);
  });

  it("does not grant upwards", () => {
    expect(atLeast("support", "operator")).toBe(false);
    expect(atLeast("support", "owner")).toBe(false);
    expect(atLeast("operator", "owner")).toBe(false);
  });

  it("treats a missing level as the lowest, never as full access", () => {
    // Migration 082 set every EXISTING admin to owner, so a null here is a row
    // created since. Defaulting it upward would be a silent privilege grant.
    expect(atLeast(null, "support")).toBe(true);
    expect(atLeast(null, "operator")).toBe(false);
    expect(atLeast(undefined, "owner")).toBe(false);
  });
});
