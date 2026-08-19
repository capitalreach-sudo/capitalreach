import { serialiseJsonLd, type JsonLd } from "@/lib/seo";

/**
 * Renders structured data as a real script element. Next's `other` metadata
 * field cannot do this — it produces a <meta> tag, which crawlers ignore.
 *
 * dangerouslySetInnerHTML is required for a script body and is safe here:
 * serialiseJsonLd escapes every character that could close the element.
 */
export function JsonLdScript({ data }: { data: JsonLd }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }}
    />
  );
}
