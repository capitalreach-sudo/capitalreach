import { describe, it, expect } from "vitest";
import { maskName, protectFounders } from "@/lib/identity";

describe("maskName", () => {
  it("masks a plain two-part name to first name plus last initial", () => {
    expect(maskName("Jane Doe")).toBe("Jane D.");
    expect(maskName("Sarah Kim")).toBe("Sarah K.");
    expect(maskName("  jean  luc  ")).toBe("jean L.");
  });

  it("keeps a single-token name as-is", () => {
    expect(maskName("Cher")).toBe("Cher");
  });

  it("returns empty for empty, null, or undefined", () => {
    expect(maskName("")).toBe("");
    expect(maskName("   ")).toBe("");
    expect(maskName(null)).toBe("");
    expect(maskName(undefined)).toBe("");
  });

  it("initials from the first letter inside a decorated last token", () => {
    // The initial must be a letter: "Testfirma (." is not a masked name.
    expect(maskName("Testfirma Founder (demo)")).toBe("Testfirma D.");
    expect(maskName("Ana Ruiz (demo)")).toBe("Ana D.");
  });

  it("skips trailing tokens that contain no letter at all", () => {
    expect(maskName("Jane Doe ★")).toBe("Jane D.");
    expect(maskName("Jane Doe !!!")).toBe("Jane D.");
  });

  it("falls back to the first token when no later token has a letter", () => {
    expect(maskName("Jane !!!")).toBe("Jane");
  });

  it("handles non-ASCII letters", () => {
    expect(maskName("Zoë Åberg")).toBe("Zoë Å.");
    expect(maskName("José Núñez-García")).toBe("José N.");
  });
});

describe("protectFounders", () => {
  const founders = [
    { name: "Sarah Kim", linkedin_url: "https://linkedin.com/in/sk", twitter_url: "https://x.com/sk" },
  ];

  it("returns founders untouched when reveal is true", () => {
    expect(protectFounders(founders, true)).toEqual(founders);
  });

  it("masks names and strips social URLs when reveal is false", () => {
    expect(protectFounders(founders, false)).toEqual([
      { name: "Sarah K.", linkedin_url: null, twitter_url: null },
    ]);
  });

  it("tolerates null and undefined lists", () => {
    expect(protectFounders(null, false)).toEqual([]);
    expect(protectFounders(undefined, true)).toEqual([]);
  });
});
