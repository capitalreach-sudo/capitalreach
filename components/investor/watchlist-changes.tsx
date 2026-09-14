"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useReadOnly } from "@/components/dashboard/read-only";
import { Ledger, LedgerCell, LedgerRow, Section } from "@/components/ui/ledger";
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
 * What moved on the companies you are watching, as ledger rows.
 *
 * Renders only when something changed (S4): a quiet week is not a section.
 * Marking as read is explicit rather than on-open, so glancing at the list
 * does not silently clear companies you meant to come back to. Rows are real
 * links to the listing, so the detail page counts the visit.
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

  if (changes === null || watching === 0 || changes.length === 0) return null;

  return (
    <Section
      id="what-moved"
      title={tf("dashboard.investor.whatMoved", "What moved")}
      end={!readOnly && (
        <button type="button" className="cr-btn cr-btn--text" onClick={markSeen} disabled={busy} aria-busy={busy || undefined}>
          {t("watchChanges.markSeen")}
        </button>
      )}
    >
      <Ledger columns="minmax(0,1fr) auto">
        {changes.map((c, i) => (
          <LedgerRow key={`${c.startupId}-${c.at}-${i}`} href={`/startups/${c.startupSlug}`} label={c.startupName}>
            <LedgerCell primary>
              <span className="cr-row-title">{c.startupName}</span>
              <span className="cr-row-sub">{c.summary}</span>
            </LedgerCell>
            <LedgerCell align="end">
              <time className="cr-row-sub" dateTime={c.at} style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatDate(c.at)}
              </time>
            </LedgerCell>
          </LedgerRow>
        ))}
        {docRooms.map((d) => (
          <LedgerRow key={`room-${d.startupId}`} href={`/startups/${d.startupSlug}`} label={d.startupName}>
            <LedgerCell primary>
              <span className="cr-row-title">{d.startupName}</span>
              <span className="cr-row-sub">
                {d.count === 1 ? t("watchChanges.docsInRoomOne") : t("watchChanges.docsInRoom", { count: d.count })}
              </span>
            </LedgerCell>
            <LedgerCell />
          </LedgerRow>
        ))}
      </Ledger>
    </Section>
  );
}
