"use client";

import { useEffect } from "react";

/**
 * Last resort: an error thrown by the root layout itself.
 *
 * app/error.tsx cannot catch this, because it renders *inside* the layout that
 * failed. This one replaces the whole document, which is why it has to supply
 * its own <html> and <body> — and why it cannot rely on globals.css having
 * loaded. Every colour here is inline and literal for that reason.
 */
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
      <body style={{ margin: 0, background: "#F5F0E8" }}>
        <div
          style={{
            minHeight: "100vh", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "48px 24px", textAlign: "center",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          }}
        >
          <div style={{ fontSize: "40px", color: "#D8D0C4", marginBottom: "20px", lineHeight: 1 }}>◆</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: "26px", color: "#1A1612", margin: "0 0 10px" }}>
            Something went wrong
          </h1>
          <p style={{ fontWeight: 300, fontSize: "14px", color: "#6B6056", lineHeight: 1.6, maxWidth: "360px", margin: "0 0 28px" }}>
            CapitalReach failed to load. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              height: "40px", padding: "0 22px", background: "#B5651D",
              border: "none", borderRadius: "4px", cursor: "pointer",
              fontWeight: 600, fontSize: "13px", color: "#fff",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ fontFamily: "monospace", fontSize: "10px", color: "#9C8E82", marginTop: "28px" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
