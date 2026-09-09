import { describe, it, expect } from "vitest";
import { maskContactDetails, detectScamPatterns, applyMessageSafety } from "../lib/message-safety";

/**
 * Masking rewrites what somebody wrote, and a scam warning tells one person
 * to distrust another. Both are heavy, so the tests that matter most here are
 * the ones proving they stay quiet on ordinary conversation.
 */
describe("maskContactDetails", () => {
  it("withholds an email, keeping the sentence readable", () => {
    const r = maskContactDetails("Sure, reach me at jane@acme.com tomorrow");
    expect(r.text).not.toContain("jane@acme.com");
    expect(r.text).toContain("reach me at");
    expect(r.masked).toContain("email");
  });

  it("withholds a phone number", () => {
    const r = maskContactDetails("call me on +44 7700 900123");
    expect(r.text).not.toContain("900123");
    expect(r.masked).toContain("phone");
  });

  it("withholds messaging handles", () => {
    expect(maskContactDetails("ping me on telegram @janedoe").masked).toContain("messaging_app");
    expect(maskContactDetails("here: t.me/janedoe").masked).toContain("messaging_app");
  });

  it("withholds a link off the platform but keeps ordinary references", () => {
    expect(maskContactDetails("meet here https://calendly.com/jane").masked).toContain("external_link");
    expect(maskContactDetails("our page https://www.linkedin.com/in/jane").masked).toEqual([]);
  });

  it("leaves money alone -- the most common sentence on the platform", () => {
    expect(maskContactDetails("we're raising 2,000,000 at a 8,000,000 pre").masked).toEqual([]);
    expect(maskContactDetails("MRR is 45000 and growing").masked).toEqual([]);
  });

  it("leaves ordinary conversation untouched", () => {
    const t = "Thanks for the deck. Happy to talk Thursday about the Series A.";
    expect(maskContactDetails(t)).toEqual({ text: t, masked: [] });
  });
});

describe("detectScamPatterns", () => {
  it("marks the advance-fee approach", () => {
    const f = detectScamPatterns("Before we release the funds you'll need to pay a 5,000 processing fee");
    expect(f.some((x) => x.pattern === "advance_fee")).toBe(true);
  });

  it("marks payment instructions off the platform", () => {
    expect(detectScamPatterns("send it to this BTC wallet address").some((f) => f.pattern === "off_platform_payment")).toBe(true);
  });

  it("does NOT mark ordinary talk about the platform fee", () => {
    expect(detectScamPatterns("I see CapitalReach charges a 2% success fee at close")).toEqual([]);
    expect(detectScamPatterns("What's your legal cost estimate for the round?")).toEqual([]);
  });

  it("does NOT mark an investor discussing a wire in the normal way", () => {
    expect(detectScamPatterns("Once we sign, we can wire the funds within a week")).toEqual([]);
  });
});

describe("applyMessageSafety", () => {
  const config = { maskContacts: true, scamWarnings: true };

  it("withholds details while no deal is registered, and keeps the original", () => {
    const r = applyMessageSafety({ body: "mail me jane@acme.com", dealRegistered: false, config });
    expect(r.body).not.toContain("jane@acme.com");
    expect(r.bodyOriginal).toContain("jane@acme.com");
    expect(r.maskedAnything).toBe(true);
  });

  it("stops withholding once the deal is on the record", () => {
    const r = applyMessageSafety({ body: "mail me jane@acme.com", dealRegistered: true, config });
    expect(r.body).toContain("jane@acme.com");
    expect(r.bodyOriginal).toBeNull();
    expect(r.maskedAnything).toBe(false);
  });

  it("keeps no copy when there was nothing to withhold", () => {
    const r = applyMessageSafety({ body: "Talk Thursday?", dealRegistered: false, config });
    expect(r.bodyOriginal).toBeNull();
    expect(r.flags).toBeNull();
  });

  it("still marks a scam pattern after the deal is registered", () => {
    const r = applyMessageSafety({
      body: "pay the retainer fee before we release funds", dealRegistered: true, config,
    });
    expect(r.flags?.scam).toContain("advance_fee");
  });
});
