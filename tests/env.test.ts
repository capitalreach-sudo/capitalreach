import { describe, it, expect } from "vitest";
import { isConfigured } from "@/lib/env";

describe("isConfigured — the placeholder contract check-env.mjs mirrors", () => {
  it("treats every placeholder marker as unset", () => {
    for (const v of ["REPLACE_ME", "sk_REPLACE_ME_123", "your-key-here",
                     "placeholder", "xxx", "changeme", "  "]) {
      expect(isConfigured(v), v).toBe(false);
    }
  });
  it("accepts real-looking values", () => {
    expect(isConfigured("sk_live_a1b2c3")).toBe(true);
    expect(isConfigured("https://abc.supabase.co")).toBe(true);
  });
  it("rejects empty and missing", () => {
    expect(isConfigured("")).toBe(false);
    expect(isConfigured(undefined)).toBe(false);
    expect(isConfigured(null)).toBe(false);
  });
});
