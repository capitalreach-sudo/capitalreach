import { describe, it, expect } from "vitest";
import { prune, serialiseJsonLd, startupJsonLd, breadcrumbJsonLd } from "@/lib/seo";

describe("structured data", () => {
  it("omits empty fields rather than asserting null", () => {
    const out = prune({ a: 1, b: null, c: "", d: [], e: {}, f: { g: null } });
    expect(out).toEqual({ a: 1 });
  });

  it("cannot break out of the script element", () => {
    // A listing name is user input. Without escaping, this closes the script
    // tag and everything after it is markup on the platform's own domain.
    const json = serialiseJsonLd(startupJsonLd({
      name: '</script><img src=x onerror=alert(1)>',
      slug: "x", tagline: null, website: null, country: null, founded_year: null, industry: null,
    }));
    expect(json).not.toContain("</script>");
    expect(json).not.toContain("<img");
    expect(json).toContain("\\u003c");
  });

  it("escapes ampersands too", () => {
    expect(serialiseJsonLd({ name: "Smith & Co" })).toContain("\\u0026");
  });

  it("still parses back to the original string", () => {
    const name = "Smith & <Co>";
    const parsed = JSON.parse(serialiseJsonLd({ name }));
    expect(parsed.name).toBe(name);
  });

  it("does not describe a raise as a purchasable offer", () => {
    const json = JSON.stringify(startupJsonLd({
      name: "Acme", slug: "acme", tagline: "We do things",
      website: null, country: "DE", founded_year: 2023, industry: "FinTech",
    }));
    expect(json).not.toContain('"Offer"');
    expect(json).not.toContain('"Product"');
    expect(json).not.toContain("price");
  });

  it("numbers breadcrumbs from one", () => {
    const bc = breadcrumbJsonLd([{ name: "Startups", path: "/startups" }, { name: "Acme", path: "/startups/acme" }]);
    const items = bc.itemListElement as Array<{ position: number }>;
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
  });
});
