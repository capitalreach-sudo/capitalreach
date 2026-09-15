"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { useReadOnly } from "@/components/dashboard/read-only";
import { formatDate } from "@/lib/format";

type Change = {
  type: "update" | "document" | "round_state" | "metrics";
  startupId: string;
  startupName: string;
  startupSlug: string;
  at: string;
  summary: string;
};

// Data-room size per company. A count with no timestamp (documents carry
// none in the schema), so it renders as current state, never as an entry on
// the dated timeline.
type DocRoom = {
  startupId: string;
  startupName: string;
  startupSlug: string;
  count: number;
};

/**
 * What moved on the companies you are watching, as plain hairline rows.
 *
 * Renders only when something changed (S4): a quiet week is not a section.
 * Marking as read is explicit rather than on-open, so glancing at the list
 * does not silently clear companies you meant to come back to. Rows are real
 * links to the listing, so the detail page counts the visit.
 *
 * Inline-styled to match every sibling panel on this dashboard (WhoViewedYou,
 * SharedWithYou, SavedSearchManager, all in investor-dashboard-client.tsx).
 * This file used to render through Ledger/LedgerRow/Section -- the component
 * system from the Apple Design redesign that the rest of this dashboard was
 * explicitly reverted away from. The dashboard client itself was reverted;
 * this leaf component was not (components/ui/ledger.tsx never moved either),
 * so it kept rendering a different visual system the instant it had rows to
 * show. Same data, same behavior, now the house inline-style idiom.
 */
export function WatchlistChanges() {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const tf = (key: string, fallback: string) => {
    const out = t(key);
    return out === key ? fallback : out;
  };
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [docRooms, setDocRooms] = useState<DocRoom[]>([]);
  const [watching, setWatching] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/watchlist/changes").catch(() => null);
    if (!res?.ok) { setChanges([]); return; }
    const j = await res.json().catch(() => ({}));
    setChanges(Array.isArray(j.changes) ? j.changes : []);
    setDocRooms(Array.isArray(j.documents) ? j.documents : []);
    setWatching(j.watching ?? 0);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function markSeen() {
    if (readOnly || busy) return;
    setBusy(true);
    await fetch("/api/watchlist/changes", { method: "POST" }).catch(() => {});
    setBusy(false);
    void load();
  }

  // Documents render unconditionally below alongside changes (the design
  // comment above explains why they're a count, not a dated entry) -- but
  // this guard used to bail on changes.length alone, so a quiet week with a
  // populated data room hid the whole panel, docRooms included. Gate on both
  // being empty instead.
  if (changes === null || watching === 0 || (changes.length === 0 && docRooms.length === 0)) return null;

  return (
    <section style={{ borderTop: "1px solid var(--cr-rule)", paddingTop: "24px", marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <span className="ruled-label">{tf("dashboard.investor.whatMoved", "What moved")}</span>
        {!readOnly && (
          <button
            type="button"
            onClick={markSeen}
            disabled={busy}
            aria-busy={busy || undefined}
            style={{ background: "none", border: "none", padding: 0, cursor: busy ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)" }}
          >
            {t("watchChanges.markSeen")}
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {changes.map((c, i) => (
          <Link
            key={`${c.startupId}-${c.at}-${i}`}
            href={`/startups/${c.startupSlug}`}
            style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "12px 0", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none", textDecoration: "none" }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)" }}>
                {c.startupName}
              </span>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                {c.summary}
              </p>
            </div>
            <time dateTime={c.at} style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {formatDate(c.at)}
            </time>
          </Link>
        ))}
        {docRooms.map((d, i) => (
          <Link
            key={`room-${d.startupId}`}
            href={`/startups/${d.startupSlug}`}
            style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "12px 0", borderTop: (changes.length > 0 || i > 0) ? "1px solid var(--cr-rule)" : "none", textDecoration: "none" }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)" }}>
                {d.startupName}
              </span>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                {d.count === 1 ? t("watchChanges.docsInRoomOne") : t("watchChanges.docsInRoom", { count: d.count })}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
