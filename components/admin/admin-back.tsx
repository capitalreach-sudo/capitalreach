"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * The way back from an impersonation.
 *
 * The view-as pages are reached from queues, member lists and the bench, so a
 * hardcoded destination would often be wrong; history is the truth about where
 * the admin actually was. A direct or new-tab open has no history to go back
 * to, so that case falls through to the console rather than a dead click.
 */
export function AdminBack({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/admin");
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        minHeight: "40px", padding: "0 4px",
        background: "none", border: "none", cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
        color: "var(--cr-ink-3)",
      }}
    >
      <ArrowLeft style={{ width: 15, height: 15 }} aria-hidden />
      {label}
    </button>
  );
}
