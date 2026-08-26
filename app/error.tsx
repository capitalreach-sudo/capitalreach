"use client";

import { useTranslation } from "@/hooks/useTranslation";

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
  const { t } = useTranslation();

  // Stale-chunk self-heal: after a deploy, a browser still holding the old
  // page requests JS chunks that no longer exist — the crash looks like
  // "something went wrong" and reset() re-crashes forever because the chunk
  // is still gone. The only real fix is a full reload for the new build;
  // one automatic attempt, guarded so a genuinely broken build cannot loop.
  useEffect(() => {
    const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
    const isChunkError = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg);
    if (isChunkError && !sessionStorage.getItem("cr_chunk_reloaded")) {
      sessionStorage.setItem("cr_chunk_reloaded", "1");
      window.location.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {t("errorPage.title")}
      </h1>

      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.6, maxWidth: "360px", marginBottom: "28px" }}>
        {t("errorPage.body")}
      </p>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => {
            // First press: re-render in place (transient failures recover).
            // Second press within the same error: the state is not transient
            // — do the thing that actually works, a full reload.
            if (sessionStorage.getItem("cr_err_reset_tried")) {
              sessionStorage.removeItem("cr_err_reset_tried");
              window.location.reload();
              return;
            }
            sessionStorage.setItem("cr_err_reset_tried", "1");
            reset();
          }}
          style={{
            height: "40px", padding: "0 22px", background: "var(--cr-copper)",
            border: "none", borderRadius: "4px", cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff",
          }}
        >
          {t("errorPage.tryAgain")}
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
          {t("errorPage.backHome")}
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
