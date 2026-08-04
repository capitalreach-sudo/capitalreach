import { ImageResponse } from "next/og";

/**
 * The default share card (og:image) for every page that doesn't declare its
 * own. The layout previously pointed og:image at /og-default.png, a file that
 * never existed -- every share on LinkedIn/X/WhatsApp rendered a bare text
 * card. This file-convention image replaces that dead reference.
 *
 * Design direction A, same tokens as globals.css: paper field, ink serif
 * wordmark, one copper rule. Playfair is fetched at build time; if that
 * fetch ever fails the card falls back to the default sans rather than
 * failing the build.
 */

export const runtime = "edge";
export const alt = "CapitalReach — Startup Investment Marketplace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#F5F0E8";
const INK = "#1A1612";
const INK_3 = "#6B6056";
const COPPER = "#B5651D";

async function playfair(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,600&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OgImage() {
  const serif = await playfair();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          background: PAPER,
          padding: "80px 96px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 54, height: 4, background: COPPER, display: "flex" }} />
          <div
            style={{
              fontSize: 26,
              color: COPPER,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            Private Capital, Properly Introduced
          </div>
        </div>
        <div
          style={{
            fontSize: 124,
            fontFamily: serif ? "Playfair" : undefined,
            fontStyle: serif ? "italic" : undefined,
            fontWeight: 600,
            color: INK,
            marginTop: 34,
            display: "flex",
          }}
        >
          CapitalReach
        </div>
        <div
          style={{
            fontSize: 34,
            color: INK_3,
            marginTop: 28,
            maxWidth: 900,
            lineHeight: 1.4,
            display: "flex",
          }}
        >
          Vetted startups. Serious investors. Deals that close in one place.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: serif
        ? [{ name: "Playfair", data: serif, style: "italic" as const, weight: 600 as const }]
        : undefined,
    },
  );
}
