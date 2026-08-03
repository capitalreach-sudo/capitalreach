import { describe, it, expect } from "vitest";
import { authErrorMessage } from "@/lib/auth-errors";

// Mirrors the app's t(): resolves against en.json so a deleted key fails here.
import en from "@/messages/en.json";
const t = (key: string, vars?: Record<string, string | number>) => {
  let v: unknown = en;
  for (const p of key.split(".")) v = (v as Record<string, unknown>)?.[p];
  if (typeof v !== "string") throw new Error(`missing key: ${key}`);
  return vars ? v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k])) : v;
};

// Real GoTrue strings observed or documented; the mapper matches substrings
// because wording varies by version.
const CASES: Array<[string, RegExp]> = [
  ["email rate limit exceeded", /too many emails/i],
  ["For security purposes, you can only request this after 46 seconds.", /wait 46 seconds/i],
  ["User already registered", /already exists/i],
  ["Invalid login credentials", /don't match/i],
  ["Email not confirmed", /confirm your email/i],
  ["Password should be at least 6 characters.", /at least 6 characters/i],
  ["Unable to validate email address: invalid format", /doesn't look valid/i],
  ["Signups not allowed for this instance", /paused/i],
  ["Token has expired or is invalid", /expired/i],
  ["New password should be different from the old password.", /must be different/i],
  ["TypeError: Failed to fetch", /reach the server/i],
];

describe("authErrorMessage", () => {
  for (const [raw, want] of CASES) {
    it(`maps "${raw.slice(0, 40)}"`, () => {
      expect(authErrorMessage(new Error(raw), t)).toMatch(want);
    });
  }

  it("falls back to generic for unknown errors, without leaking the raw text", () => {
    const out = authErrorMessage(new Error("brand new unmapped failure xyz"), t);
    expect(out).toMatch(/try again/i);
    expect(out).not.toMatch(/xyz/);
  });

  it("handles non-Error inputs", () => {
    expect(authErrorMessage("Invalid login credentials", t)).toMatch(/don't match/i);
    expect(authErrorMessage({ message: "Email not confirmed" }, t)).toMatch(/confirm/i);
    expect(authErrorMessage(null, t)).toMatch(/try again/i);
    expect(authErrorMessage(undefined, t)).toMatch(/try again/i);
  });
});
