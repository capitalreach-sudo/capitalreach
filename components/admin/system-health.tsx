"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { daysSince } from "@/lib/utils";

/**
 * Whether the platform's background machinery is alive.
 *
 * Every background failure used to land in console.error on Vercel — a log
 * stream nobody watches. This panel answers the two questions that matter
 * without opening a single log: has anything failed recently, and when did
 * each background job last succeed. The second matters as much as the first,
 * because a cron that silently stopped running produces no errors at all —
 * absence of a heartbeat is the only symptom.
 */
export type SystemEvent = {
  id: string;
  source: string;
  level: "info" | "error";
  message: string;
  detail: unknown;
  created_at: string;
};

const card: React.CSSProperties = {
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};

export function SystemHealth({ events, knownSources }: { events: SystemEvent[]; knownSources: string[] }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const errors = events.filter((e) => e.level === "error" && !dismissed.has(e.id));

  // Last success per source, plus known sources that have never reported --
  // a job that has never run once is the most silent failure of all.
  const lastOk = new Map<string, string>();
  for (const e of events) {
    if (e.level === "info" && !lastOk.has(e.source)) lastOk.set(e.source, e.created_at);
  }
  const sources = Array.from(new Set(knownSources.concat(Array.from(lastOk.keys()))));

  async function acknowledge(id: string) {
    // Optimistic: the row disappears immediately; deletion failing just means
    // it comes back on the next page load, which is the right failure mode
    // for an error log.
    setDismissed((prev) => new Set(prev).add(id));
    await fetch("/api/admin/system-events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  return (
    <div style={{ marginBottom: "28px" }}>
      <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
        {t("health.title")}
        {errors.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.3)", color: "var(--cr-down)", borderRadius: "3px", padding: "2px 7px", fontSize: "10px", fontWeight: 600 }}>
            <AlertCircle style={{ width: 10, height: 10 }} /> {t("health.errorCount", { count: errors.length })}
          </span>
        )}
      </h2>

      {/* Heartbeats: one row per background job. */}
      <div style={{ ...card, padding: "12px 18px", display: "flex", flexWrap: "wrap", gap: "10px 28px", marginBottom: errors.length ? "10px" : 0 }}>
        {sources.length === 0 && (
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
            {t("health.noSources")}
          </span>
        )}
        {sources.map((src) => {
          const ok = lastOk.get(src);
          // >2 days without a heartbeat on a daily job means it has missed at
          // least one run -- copper, not red: it may be config, not code.
          const stale = ok ? daysSince(ok) > 2 : true;
          return (
            <span key={src} style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-3)" }}>
              <CheckCircle2
                style={{ width: 12, height: 12, color: stale ? "var(--cr-copper)" : "var(--cr-up)" }}
                aria-hidden
              />
              {src}
              <span style={{ color: "var(--cr-ink-4)" }}>
                {ok ? t("health.lastRun", { count: daysSince(ok) }) : t("health.neverRan")}
              </span>
            </span>
          );
        })}
      </div>

      {/* Errors, newest first, dismiss = acknowledged. */}
      {errors.length > 0 && (
        <div style={{ ...card, borderColor: "rgba(180,50,50,0.3)", padding: "6px 0" }}>
          {errors.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "baseline", gap: "10px", padding: "8px 18px" }}>
              <AlertCircle style={{ width: 12, height: 12, color: "var(--cr-down)", flexShrink: 0, alignSelf: "center" }} aria-hidden />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                {e.source}
              </span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", minWidth: 0, flex: 1 }}>
                {e.message}
                {e.detail != null && (
                  <span style={{ color: "var(--cr-ink-4)", fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>
                    {" "}{JSON.stringify(e.detail).slice(0, 120)}
                  </span>
                )}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                {t("pulse.daysAgo", { count: daysSince(e.created_at) })}
              </span>
              <button
                onClick={() => acknowledge(e.id)}
                aria-label={t("health.dismiss")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", padding: "4px", display: "flex" }}
              >
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
