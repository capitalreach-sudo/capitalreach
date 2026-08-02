"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error UI.
 *
 * There was no error.tsx anywhere in this app, which meant any render error --
 * a null field, a failed fetch, a bad shape from the database -- fell through
 * to Next's default error screen. In production that is a bare "Application
 * error: a client-side exception has occurred", which is exactly what a tester
 * would describe as the site freezing and showing error messages.
 *
 * Next catches errors in this segment and everything below it, and `reset()`
 * re-renders the subtree without a full page load, so a transient failure
 * recovers in place.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the real stack once this is deployed --
    // Next strips messages from client bundles in production.
    console.error("[route error]", error.digest ?? "", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "70vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "var(--cr-paper)", padding: "48px 24px", textAlign: "center",
      }}
    >
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "40px", color: "var(--cr-paper-4)", marginBottom: "20px", lineHeight: 1 }}>
        ◆
      </div>

      <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "26px", color: "var(--cr-ink)", marginBottom: "10px" }}>
        Something went wrong
      </h1>

      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.6, maxWidth: "360px", marginBottom: "28px" }}>
        This page failed to load. It is usually temporary — trying again often works.
      </p>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            height: "40px", padding: "0 22px", background: "var(--cr-copper)",
            border: "none", borderRadius: "4px", cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff",
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            height: "40px", padding: "0 22px", display: "flex", alignItems: "center",
            border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
            color: "var(--cr-ink-3)", textDecoration: "none",
          }}
        >
          Back to home
        </Link>
      </div>

      {/* Shown so a user can quote it in a support message. Next replaces the
          error message itself with a generic string in production, so the
          digest is the only thing that ties a report to a server log. */}
      {error.digest && (
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", marginTop: "28px" }}>
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
