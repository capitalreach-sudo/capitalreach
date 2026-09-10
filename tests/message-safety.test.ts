import { describe, it, expect, beforeEach, vi } from "vitest";
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

  it("does not eat a date or a time -- the most common sentence these two will exchange", () => {
    // "can we do 2026-09-15 14:00" carries twelve digits and was being
    // withheld as a phone number, which broke scheduling entirely.
    expect(maskContactDetails("can we do 2026-09-15 14:00").masked).toEqual([]);
    expect(maskContactDetails("Tuesday 14:00 or 15/09/2026?").masked).toEqual([]);
  });

  it("does not treat addressing somebody as a handle", () => {
    // A bare @name is how people talk. The messaging-app rule still catches
    // "telegram @janedoe", which is the case that routes somebody off here.
    expect(maskContactDetails("@sarah what do you think?").masked).toEqual([]);
    expect(maskContactDetails("ping me on telegram @janedoe").masked).toContain("messaging_app");
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

/**
 * maskFreeText guards the surfaces that are not the chat: a listing question
 * and its answer (which go PUBLIC once answered), a document request note and
 * a share note. Each one reaches the other party as a notification and an
 * email, so an unmasked contact detail there defeats the whole layer.
 *
 * The config read and the signal write are stubbed: what is under test is
 * that the caller gets masked text back and that a leak attempt is recorded,
 * not Supabase.
 */
describe("maskFreeText", () => {
  const signals: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    signals.length = 0;
    vi.resetModules();
    vi.doMock("../lib/trust-signals", () => ({
      recordSignal: async (subjectType: string, subjectId: string, signal: string, severity: string, detail: Record<string, unknown>) => {
        signals.push({ subjectType, subjectId, signal, severity, ...detail });
      },
    }));
  });

  async function run(text: string, maskContacts = true) {
    const { maskFreeText } = await import("../lib/message-safety");
    return maskFreeText({
      text, surface: "listing_question", subjectType: "investor",
      subjectId: "11111111-1111-4111-8111-111111111111",
      config: { maskContacts, scamWarnings: false },
    });
  }

  it("withholds a contact detail written into a question", async () => {
    const r = await run("What is your churn? Easier over email: jane@acme.com");
    expect(r.text).not.toContain("jane@acme.com");
    expect(r.masked).toContain("email");
  });

  it("records the attempt for a reviewer, with the original", async () => {
    await run("call me on +44 7700 900123");
    expect(signals).toHaveLength(1);
    expect(signals[0].signal).toBe("offplatform_contact");
    expect(signals[0].surface).toBe("listing_question");
    expect(String(signals[0].original)).toContain("900123");
  });

  it("stays silent on an ordinary question", async () => {
    const q = "What was ARR at the end of Q2, and how much of it is contracted?";
    const r = await run(q);
    expect(r.text).toBe(q);
    expect(r.masked).toEqual([]);
    expect(signals).toHaveLength(0);
  });

  it("does not rewrite anything when masking is switched off", async () => {
    const r = await run("reach me at jane@acme.com", false);
    expect(r.text).toContain("jane@acme.com");
    expect(signals).toHaveLength(0);
  });

  it("passes empty text through without a config read", async () => {
    const { maskFreeText } = await import("../lib/message-safety");
    const r = await maskFreeText({
      text: "", surface: "deal_share", subjectType: "investor", subjectId: "x",
    });
    expect(r.masked).toEqual([]);
  });
});

/**
 * The listing and the investor profile. Everything above guards prose aimed
 * at one counterparty; these two are aimed at everybody, which makes an
 * address in a description a billboard rather than a leak.
 *
 * The link rule is the whole difference. A company's own website is the most
 * ordinary thing on a listing and withholding it would break real content, so
 * these fields keep their links and lose only the ways to reach a person
 * directly.
 */
describe("maskContactDetails with allowLinks", () => {
  it("keeps a company's own site while still withholding an address", () => {
    const r = maskContactDetails(
      "We're at https://acme.io, deck on request, or mail founders@acme.io",
      { allowLinks: true },
    );
    expect(r.text).toContain("https://acme.io");
    expect(r.text).not.toContain("founders@acme.io");
    expect(r.masked).toEqual(["email"]);
  });

  it("keeps a link the message rule would have withheld", () => {
    // A booking link is circumvention in a chat and ordinary on a listing.
    const r = maskContactDetails("Book a slot: https://calendly.com/jane", { allowLinks: true });
    expect(r.text).toContain("https://calendly.com/jane");
    expect(r.masked).toEqual([]);
    expect(maskContactDetails("Book a slot: https://calendly.com/jane").masked).toContain("external_link");
  });

  it("still withholds a phone number and a messaging handle", () => {
    expect(maskContactDetails("Reach the team on +44 7700 900123", { allowLinks: true }).masked).toContain("phone");
    expect(maskContactDetails("we're on telegram @acmefounders", { allowLinks: true }).masked).toContain("messaging_app");
  });

  it("leaves an ordinary pitch alone", () => {
    const t = "We sell contract analytics to mid-market legal teams in the DACH region.";
    expect(maskContactDetails(t, { allowLinks: true })).toEqual({ text: t, masked: [] });
  });
});

describe("maskProse", () => {
  const signals: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    signals.length = 0;
    vi.resetModules();
    vi.doMock("../lib/trust-signals", () => ({
      recordSignal: async (subjectType: string, subjectId: string, signal: string, severity: string, detail: Record<string, unknown>) => {
        signals.push({ subjectType, subjectId, signal, severity, ...detail });
      },
    }));
  });

  async function save(fields: Record<string, unknown>, maskContacts = true) {
    const { maskProse, LISTING_PROSE_FIELDS } = await import("../lib/message-safety");
    return maskProse({
      fields,
      proseFields: LISTING_PROSE_FIELDS,
      surface: "listing_prose",
      subjectType: "startup",
      subjectId: "22222222-2222-4222-8222-222222222222",
      config: { maskContacts, scamWarnings: false },
    });
  }

  it("withholds an address written into the description", async () => {
    const r = await save({ description: "Series A raise. Questions to jane@acme.com" });
    expect(r.fields.description).not.toContain("jane@acme.com");
    expect(r.masked).toContain("email");
    expect(r.changed).toHaveProperty("description");
  });

  it("leaves the company's own URL standing", async () => {
    const r = await save({ description: "Product tour at https://acme.io/demo" });
    expect(r.fields.description).toContain("https://acme.io/demo");
    expect(r.masked).toEqual([]);
    expect(signals).toHaveLength(0);
  });

  it("withholds a phone number in the pitch", async () => {
    const r = await save({ problem: "Call the founder direct on +44 7700 900123" });
    expect(String(r.fields.problem)).not.toContain("900123");
    expect(r.masked).toContain("phone");
  });

  it("leaves ordinary prose and every non-prose column untouched", async () => {
    const fields = {
      tagline: "Contract analytics for mid-market legal teams",
      problem: "Review takes six weeks and nobody can say why.",
      funding_target: 2_000_000,
      website: "https://acme.io",
    };
    const r = await save(fields);
    expect(r.fields).toEqual(fields);
    expect(r.masked).toEqual([]);
    expect(r.changed).toEqual({});
    expect(signals).toHaveLength(0);
  });

  it("records ONE signal for the save, naming the columns", async () => {
    // A signature block pasted into three boxes is one attempt, not three
    // rows in a reviewer's queue.
    await save({
      description: "mail jane@acme.com",
      problem: "or jane@acme.com",
      solution: "or +44 7700 900123",
    });
    expect(signals).toHaveLength(1);
    expect(signals[0].signal).toBe("offplatform_contact");
    expect(signals[0].surface).toBe("listing_prose");
    expect(signals[0].fields).toEqual(["description", "problem", "solution"]);
    expect(signals[0].kinds).toEqual(expect.arrayContaining(["email", "phone"]));
  });

  it("does not rewrite anything when masking is switched off", async () => {
    const r = await save({ description: "reach me at jane@acme.com" }, false);
    expect(r.fields.description).toContain("jane@acme.com");
    expect(signals).toHaveLength(0);
  });

  it("covers the investor profile's own columns", async () => {
    const { maskProse, PROFILE_PROSE_FIELDS } = await import("../lib/message-safety");
    const r = await maskProse({
      fields: { bio: "Angel, ex-CMO. Fastest on telegram @acmeangel", investment_thesis: "Seed B2B SaaS in Europe." },
      proseFields: PROFILE_PROSE_FIELDS,
      surface: "profile_prose",
      subjectType: "investor",
      subjectId: "33333333-3333-4333-8333-333333333333",
      config: { maskContacts: true, scamWarnings: false },
    });
    expect(String(r.fields.bio)).not.toContain("@acmeangel");
    expect(r.fields.investment_thesis).toBe("Seed B2B SaaS in Europe.");
    expect(r.masked).toContain("messaging_app");
  });
});
