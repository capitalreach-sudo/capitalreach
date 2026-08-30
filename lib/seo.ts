import { brand } from "@/lib/brand";

/**
 * F: structured data that actually reaches a crawler.
 *
 * The listing page has been emitting its JSON-LD through Next's `other`
 * metadata field, which renders `<meta name="script:ld+json" content="...">`.
 * That is a meta tag, not a script — no search engine has ever read it. It
 * looked right in the source and did nothing for a year.
 *
 * Two rules here:
 *  - a field that is null is omitted, not emitted as null: absent data is
 *    better than data asserting nothing;
 *  - the JSON is escaped for a <script> context. A listing named
 *    `</script><img onerror=…>` would otherwise be script injection with the
 *    platform's own domain behind it, and listing names are user input.
 */

export type JsonLd = Record<string, unknown>;

/** Drops null/undefined/empty entries, recursively. */
export function prune(obj: JsonLd): JsonLd {
  const out: JsonLd = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) {
      const arr = v.filter(x => x != null && x !== "");
      if (arr.length) out[k] = arr;
      continue;
    }
    if (typeof v === "object") {
      const nested = prune(v as JsonLd);
      if (Object.keys(nested).length) out[k] = nested;
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Serialise for embedding in <script type="application/ld+json">.
 *
 * `<` is the only character that can end the script element early, and `&`
 * is escaped alongside it so the result is also safe if a parser treats the
 * content as HTML-escaped. Unicode escapes keep the JSON valid.
 */
export function serialiseJsonLd(data: JsonLd): string {
  return JSON.stringify(prune(data))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export const absoluteUrl = (path: string): string =>
  `${brand.url.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

export interface StartupSeo {
  name: string;
  slug: string;
  tagline: string | null;
  website: string | null;
  country: string | null;
  founded_year: number | null;
  industry: string | null;
}

/**
 * A listing is an organisation raising capital. It is deliberately NOT marked
 * up as a Product or an Offer: the raise is not a purchasable good, and
 * describing a private placement as an offer with a price is the kind of
 * markup that is both wrong and regulated.
 */
export function startupJsonLd(s: StartupSeo): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: s.name,
    description: s.tagline,
    url: s.website || absoluteUrl(`/startups/${s.slug}`),
    ...(s.website ? { sameAs: [s.website] } : {}),
    foundingDate: s.founded_year ? String(s.founded_year) : null,
    address: s.country ? { "@type": "PostalAddress", addressCountry: s.country } : null,
    knowsAbout: s.industry,
    subjectOf: {
      "@type": "WebPage",
      url: absoluteUrl(`/startups/${s.slug}`),
      isPartOf: { "@type": "WebSite", name: brand.name, url: brand.url },
    },
  };
}

export interface InvestorSeo {
  slug: string;
  displayName: string | null;
  firmName: string | null;
  bio: string | null;
  type: string | null;
  website: string | null;
}

export function investorJsonLd(i: InvestorSeo): JsonLd {
  const name = i.firmName || i.displayName;
  if (!name) return {};
  return {
    "@context": "https://schema.org",
    // A fund or firm is an Organization; a solo angel is still published under
    // a display name they chose, so Organization is the honest common type
    // rather than guessing at a Person and putting a real name in markup.
    "@type": "Organization",
    name,
    description: i.bio,
    url: absoluteUrl(`/investors/${i.slug}`),
    ...(i.website ? { sameAs: [i.website] } : {}),
  };
}

export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: absoluteUrl(t.path),
    })),
  };
}


/** The site itself, for the knowledge panel: who runs this, one canonical
 *  name and logo. Emitted once, on the homepage. */
export function organizationJsonLd(): JsonLd {
  return prune({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CapitalReach",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon.png"),
    description: "A private marketplace where startups raise capital and investors deploy it. 2% success fee, paid by the startup at close.",
  });
}

/** WebSite with a SearchAction: tells Google the directory is searchable,
 *  which is what earns the sitelinks search box. */
export function webSiteJsonLd(): JsonLd {
  return prune({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "CapitalReach",
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: absoluteUrl("/startups?query={search_term_string}") },
      "query-input": "required name=search_term_string",
    },
  });
}
