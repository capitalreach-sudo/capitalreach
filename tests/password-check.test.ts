import { describe, it, expect, vi, afterEach } from "vitest";
import { isPasswordBreached } from "../lib/password-check";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// prefix 5BAA6, suffix 1E4C9B93F3F0682250B6CF8331B7EE68FD8
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

afterEach(() => vi.unstubAllGlobals());

describe("isPasswordBreached", () => {
  it("finds a breached password in the k-anonymity bucket", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      // Only the 5-char prefix may ever reach the network.
      expect(String(url)).toBe("https://api.pwnedpasswords.com/range/5BAA6");
      return new Response(`AAAA:1\n${SUFFIX}:3861493\nBBBB:2`);
    }));
    const r = await isPasswordBreached("password");
    expect(r.breached).toBe(true);
    expect(r.count).toBe(3861493);
  });

  it("a clean password is not flagged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("AAAA:1\nBBBB:2")));
    const r = await isPasswordBreached("password");
    expect(r.breached).toBe(false);
  });

  it("fails OPEN when the API is unreachable — an outage must not block signup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const r = await isPasswordBreached("password");
    expect(r.breached).toBe(false);
  });

  it("fails OPEN on a non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const r = await isPasswordBreached("password");
    expect(r.breached).toBe(false);
  });
});
