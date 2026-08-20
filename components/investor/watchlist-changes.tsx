"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, FileText, Activity, Pause, BarChart3 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

type Change = {
  type: "update" | "document" | "round_state" | "metrics";
  startupId: string;
  startupName: string;
  startupSlug: string;
  at: string;
  summary: string;
};

const ICON = {
  update: Activity,
  document: FileText,
  round_state: Pause,
  metrics: BarChart3,
} as const;

/**
 * What moved on the companies you are watching.
 *
 * Saving a company used to be a one-way action: it went on a list and the list
 * never spoke again. Everything here was already in the database — this is
 * assembly, not new data.
 *
 * Marking as read is explicit rather than on-open, so glancing at the panel
 * while walking past does not silently clear twenty companies you meant to
 * come back to.
 */
export function WatchlistChanges() {
  const { t } = useTranslation();
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [watching, setWatching] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/watchlist/changes");
    if (!res.ok) { setChanges([]); return; }
    const j = await res.json();
    setChanges(j.changes ?? []);
    setWatching(j.watching ?? 0);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function markSeen() {
    setBusy(true);
    await fetch("/api/watchlist/changes", { method: "POST" }).catch(() => {});
    setBusy(false);
    void load();
  }

  // Nothing saved yet is not an empty state worth a panel — it is a different
  // page's job to get them to save something.
  if (changes === null || watching === 0) return null;

  return (
    <section style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: changes.length ? 14 : 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Bell style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
          <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
            {t("watchChanges.title")}
          </h3>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>
            {t("watchChanges.watching", { n: watching })}
          </span>
        </span>
        {changes.length > 0 && (
          <button onClick={markSeen} disabled={busy}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11.5px", color: "var(--cr-copper)" }}>
            {t("watchChanges.markSeen")}
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12.5px", color: "var(--cr-ink-4)" }}>
          {t("watchChanges.quiet")}
        </p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {changes.map((c, i) => {
            const Icon = ICON[c.type] ?? Activity;
            return (
              <li key={`${c.startupId}-${c.at}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                <Icon style={{ width: 12, height: 12, color: "var(--cr-ink-4)", marginTop: 3, flexShrink: 0 }} />
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12.5px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>
                  <Link href={`/startups/${c.startupSlug}`}
                    style={{ color: "var(--cr-ink)", fontWeight: 600, textDecoration: "none", borderBottom: "1px dotted var(--cr-ink-4)" }}>
                    {c.startupName}
                  </Link>
                  {" — "}{c.summary}
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", marginLeft: 6 }}>
                    {new Date(c.at).toLocaleDateString()}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
