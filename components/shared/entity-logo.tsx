/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { getInitials } from "@/lib/utils";

/**
 * A company's mark, everywhere a card shows one.
 *
 * With a logo: the image on a white tile (logos assume a light ground; the
 * paper background muddies dark marks). Without one — or if the image fails
 * to load — the familiar initials box, tinted with the logo's sampled colour
 * when we have it, brand copper when we do not. The fallback is state, not
 * CSS: a broken image URL must degrade to initials, never to the browser's
 * broken-image glyph on a public card.
 */
export function EntityLogo({ name, logoUrl, logoColor, size = 40, radius = 4 }: {
  name: string;
  logoUrl?: string | null;
  logoColor?: string | null;
  size?: number;
  radius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!logoUrl && !failed;
  const tint = logoColor || "var(--cr-copper)";

  if (showImage) {
    return (
      <span style={{
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        background: "#fff", border: "1px solid var(--cr-rule)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        <img
          src={logoUrl!}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", padding: Math.max(2, size * 0.08) }}
        />
      </span>
    );
  }

  return (
    <span style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
      fontSize: Math.round(size * 0.35), color: tint,
    }}>
      {getInitials(name)}
    </span>
  );
}
