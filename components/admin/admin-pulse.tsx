"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { listingCompleteness } from "@/lib/listing-completeness";
import { daysSince } from "@/lib/utils";

/**
 * What changed on the platform this week, and which listings need a nudge.
 *
 * The admin page could say how many startups and investors exist in total, a
 * number that only ever goes up and therefore says nothing about whether the
 * marketplace is working. Running it needs the derivative: are signups
 * accelerating, did anything get listed, did a deal move. And it needs to know
 * which listings are quietly failing -- a listing with no deck and no traction
 * figure will never raise, and nobody was telling anyone.
 */
export type PulseMetric = { key: string; labelKey: string; now: number; prev: number };

export type HealthListing = {
  id: string;
  name: string;
  slug: string;
  updated_at: string;
  pageviews: number | null;
  tagline?: string | null;
  problem?: string | null;
  solution?: string | null;
  market?: string | null;
  competitive_advantage?: string | null;
  use_of_funds?: string | null;
  website?: string | null;
  funding_target?: number | null;
  equity_offered?: number | null;
  min_check_size?: number | null;
  booking_url?: string | null;
  mrr?: number | null;
  arr?: number | null;
  paying_customers?: number | null;
  user_count?: number | null;
  founders?: Array<{ linkedin_url?: string | null }> | null;
  documents?: Array<unknown> | null;
  milestones?: Array<unknown> | null;
};

const card: React.CSSProperties = {
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
  padding: "20px",
};

function Delta({ now, prev }: { now: number; prev: number }) {
  const { t } = useTranslation();
  // No prior activity and none now is flat, not infinite growth -- the naive
  // percentage would render "+Infinity%" on a quiet week.
  if (prev === 0 && now === 0) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>
        <Minus style={{ width: 11, height: 11 }} /> {t("pulse.flat")}
      </span>
    );
  }
  if (prev === 0) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-up)" }}>
        <TrendingUp style={{ width: 11, height: 11 }} /> {t("pulse.newActivity")}
      </span>
    );
  }
  const pct = Math.round(((now - prev) / prev) * 100);
  const up = pct > 0, flat = pct === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: flat ? "var(--cr-ink-4)" : up ? "var(--cr-up)" : "var(--cr-down)" }}>
      <Icon style={{ width: 11, height: 11 }} /> {pct > 0 ? "+" : ""}{pct}% {t("pulse.vsLastWeek")}
    </span>
  );
}

export function AdminPulse({ metrics, listings }: { metrics: PulseMetric[]; listings: HealthListing[] }) {
  const { t } = useTranslation();

  // Weakest listings first: that is the whole point of the panel, and it means
  // the ones worth acting on are visible without scrolling.
  const health = listings
    .map((l) => ({ l, ...listingCompleteness(l), stale: daysSince(l.updated_at) }))
    .sort((a, b) => a.percent - b.percent);

  const needsWork = health.filter((h) => h.percent < 70);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "28px" }}>
      {/* ── This week ─────────────────────────────────────────────── */}
      <div>
        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "10px" }}>
          {t("pulse.title")}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
          {metrics.map((m) => (
            <div key={m.key} style={card}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {t(m.labelKey)}
              </p>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "30px", color: "var(--cr-ink)", lineHeight: 1.1, margin: "6px 0 4px" }}>
                {m.now}
              </p>
              <Delta now={m.now} prev={m.prev} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Listing health ────────────────────────────────────────── */}
      <div>
        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
          {t("pulse.healthTitle")}
          {needsWork.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", borderRadius: "3px", padding: "2px 7px", fontSize: "10px", fontWeight: 600 }}>
              <AlertTriangle style={{ width: 10, height: 10 }} /> {t("pulse.needWork", { count: needsWork.length })}
            </span>
          )}
        </h2>

        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          {health.length === 0 ? (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", padding: "20px" }}>
              {t("pulse.noListings")}
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--cr-rule)" }}>
                  {["pulse.colListing", "pulse.colComplete", "pulse.colNext", "pulse.colUpdated", "pulse.colViews"].map((k) => (
                    <th key={k} style={{ textAlign: "start", padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {health.map(({ l, percent, next, stale }) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--cr-rule)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <Link href={`/startups/${l.slug}`} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", textDecoration: "none" }}>
                        {l.name}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 14px", minWidth: "120px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, height: "3px", background: "var(--cr-paper-4)", borderRadius: "2px", minWidth: "50px" }}>
                          <div style={{ height: "3px", borderRadius: "2px", width: `${percent}%`, background: percent < 50 ? "var(--cr-down)" : percent < 70 ? "var(--cr-copper)" : "var(--cr-up)" }} />
                        </div>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-3)" }}>{percent}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>
                      {next ? t(next.labelKey) : "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: stale > 30 ? "var(--cr-copper)" : "var(--cr-ink-4)" }}>
                      {t("pulse.daysAgo", { count: stale })}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)" }}>
                      {l.pageviews ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
