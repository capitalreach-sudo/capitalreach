"use client";

import Link from "next/link";

/**
 * Every empty list is a museum drawer, labelled like one: dashed border,
 * a mono drawer tag, one sentence, one quiet action. "No results" as bare
 * text is retired alongside "Loading...".
 */
export function SpecimenDrawer({
  tag, sentence, ctaLabel, ctaHref, onCta,
}: { tag: string; sentence?: string; ctaLabel?: string; ctaHref?: string; onCta?: () => void }) {
  return (
    <div style={{
      border: "1px dashed var(--cr-paper-4)", borderRadius: "8px",
      padding: "40px 24px", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--cr-ink-4)" }}>
        {tag}
      </span>
      {sentence && (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", maxWidth: "38ch", lineHeight: 1.6 }}>
          {sentence}
        </p>
      )}
      {ctaLabel && (ctaHref ? (
        <Link href={ctaHref} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none", minHeight: "40px", display: "inline-flex", alignItems: "center" }}>
          {ctaLabel} {"→"}
        </Link>
      ) : (
        <button onClick={onCta} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", minHeight: "40px" }}>
          {ctaLabel} {"→"}
        </button>
      ))}
    </div>
  );
}
