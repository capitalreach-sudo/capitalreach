"use client";

import { useEffect } from "react";

/**
 * Last resort: an error thrown by the root layout itself.
 *
 * app/error.tsx cannot catch this, because it renders *inside* the layout that
 * failed. This one replaces the whole document, which is why it has to supply
 * its own <html> and <body>, and why it cannot rely on globals.css having
 * loaded or on the theme attribute being stamped. Every colour is therefore a
 * literal, carried in the one <style> tag below: the light palette by
 * default, the dark palette behind prefers-color-scheme. The app's cookie
 * theme cannot be honoured here without the scripts that just failed, so the
 * system preference is the closest truth available.
 */
const PALETTE = `
  :root {
    --ge-paper: #F5F0E8; --ge-paper-4: #D8D0C4;
    --ge-ink: #1A1612; --ge-ink-3: #6B6056; --ge-ink-4: #9C8E82;
    --ge-copper: #B5651D; --ge-on-copper: #FFFFFF;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ge-paper: #0F0D0A; --ge-paper-4: #2A241B;
      --ge-ink: #F0EAE0; --ge-ink-3: #998F81; --ge-ink-4: #6E6558;
      --ge-copper: #D98C33; --ge-on-copper: #1C1610;
    }
  }
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "var(--ge-paper)" }}>
        <style dangerouslySetInnerHTML={{ __html: PALETTE }} />
        <div
          style={{
            minHeight: "100vh", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "48px 24px", textAlign: "center",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          }}
        >
          <div style={{ fontSize: "40px", color: "var(--ge-paper-4)", marginBottom: "20px", lineHeight: 1 }}>◆</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: "26px", color: "var(--ge-ink)", margin: "0 0 10px" }}>
            Something went wrong
          </h1>
          <p style={{ fontWeight: 300, fontSize: "14px", color: "var(--ge-ink-3)", lineHeight: 1.6, maxWidth: "360px", margin: "0 0 28px" }}>
            CapitalReach failed to load. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              height: "40px", padding: "0 22px", background: "var(--ge-copper)",
              border: "none", borderRadius: "4px", cursor: "pointer",
              fontWeight: 600, fontSize: "13px", color: "var(--ge-on-copper)",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--ge-ink-4)", marginTop: "28px" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
