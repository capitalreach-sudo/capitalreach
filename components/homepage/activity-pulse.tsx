"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The heartbeat feed: anonymized recent activity, quietly ticking on the
 * homepage. Names appear only for facts that are already public (a live
 * listing); investors are never identified -- "a new investor joined" is the
 * whole story. Polls each minute; renders nothing until there is something
 * real to say, and nothing at all if the fetch fails.
 */
type PulseEvent = { kind: "listing" | "investor" | "nda" | "closed"; name?: string; at: string };

const KIND_KEY: Record<PulseEvent["kind"], string> = {
  listing: "feed.listingJoined",
  investor: "feed.investorJoined",
  nda: "feed.ndaSigned",
  closed: "feed.roundClosed",
};

export function ActivityPulse() {
  const { t, locale } = useTranslation();
  const [events, setEvents] = useState<PulseEvent[]>([]);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/pulse")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (live && d?.events) setEvents(d.events); })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => { live = false; clearInterval(id); };
  }, []);

  if (events.length < 3) return null;

  const rel = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "narrow" });
      if (mins < 60) return rtf.format(-Math.max(mins, 1), "minute");
      if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), "hour");
      return rtf.format(-Math.round(mins / (60 * 24)), "day");
    } catch {
      return "";
    }
  };

  return (
    <section aria-label={t("feed.title")} style={{ background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule)" }}>
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-8">
        <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("feed.title")}</div>
        {/* Ledger rows, not floating fragments: each event is an entry with
            its timestamp on the right margin, the way a register reads. */}
        <div style={{ maxWidth: "560px" }}>
          {events.slice(0, 5).map((e, i) => (
            <div key={`${e.kind}-${e.at}-${i}`} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", padding: "8px 0", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: "10px", minWidth: 0 }}>
                <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "9px", flexShrink: 0 }}>✦</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t(KIND_KEY[e.kind], e.name ? { name: e.name } : undefined)}
                </span>
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                {rel(e.at)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
