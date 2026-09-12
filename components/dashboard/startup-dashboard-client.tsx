"use client";

import { useRouter } from "next/navigation";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Eye, Lock, X } from "lucide-react";
import { ScoreDial } from "@/components/ui/score-dial";
import { Sparkline } from "@/components/ui/sparkline";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Profile, Startup } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { InvitePanel } from "@/components/shared/invite-panel";
import { InfoTip } from "@/components/shared/info-tip";
import { ShareLinks } from "@/components/startup/share-links";
import type { BenchmarkResult } from "@/lib/benchmarks";
import { CapTableCard } from "@/components/dashboard/cap-table-card";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/toast-notify";
import { listingCompleteness } from "@/lib/listing-completeness";
import { MetricsRecorder } from "@/components/dashboard/metrics-recorder";
import { FundraiseChecklist } from "@/components/dashboard/fundraise-checklist";
import { FounderAttestationModal } from "@/components/review/FounderAttestationModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  profile:      Profile;
  startup:      Startup | null;
  analytics:    { views: number; saves: number; deals: number; viewSeries?: number[]; saveSeries?: number[]; dealSeries?: number[]; raise?: { softCircled: number; committed: number }; funnel?: { termSheets: number; closed: number } };
  isLaunchMode: boolean;
  /**
   * Set when an admin is looking at someone else's dashboard. Carries the
   * founder's name for the banner, and switches every mutating control off --
   * an admin must not be able to start an AI job or open a billing portal
   * against an account that is not theirs just by clicking around.
   */
  viewingAs?: string;
  /** Latest admin rejection reason still in force (draft listings only). */
  rejectionReason?: string | null;
  /** F10: percentiles against same-stage live listings; null when the cohort is too small. */
  benchmarks?: BenchmarkResult | null;
}

// Six tabs, not four. Everything that used to stack vertically under
// "overview" now lives behind one of these -- the panels are all still here,
// they just no longer compete for the same eyeful on arrival.
type StartupTab = "overview" | "raise" | "investors" | "documents" | "ai" | "billing";

// InfoTip resolves its termKey through t(), and t() echoes an unknown key
// back raw. The glossary keys this pass adds are new, so until the
// dictionaries carry them the English wording itself is passed as the key:
// t() returns unknown strings verbatim, the same fallback path the local
// tf() helpers give plain labels.
const tipKey = (t: (k: string) => string, key: string, fallback: string) =>
  t(key) === key ? fallback : key;

// One definition for the raise meter, shared by the glance band and the full
// tracker so the two readings of the same figure can never drift apart.
const RAISE_TIP = { key: "glossary.raiseProgress", fallback: "Committed is money at finalised deals or amounts an investor marked committed. Soft-circled is money spoken for: soft circles, verbal yeses and open term sheets. Both read against the round target you set." };



// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    active:         { bg: "var(--cr-up-bg)",     color: "var(--cr-up)",      border: "color-mix(in srgb, var(--cr-up) 25%, transparent)"   },
    pending_review: { bg: "var(--cr-copper-bg)", color: "var(--cr-copper)",  border: "var(--cr-copper-br)"                                  },
    suspended:      { bg: "var(--cr-down-bg)",   color: "var(--cr-down)",    border: "color-mix(in srgb, var(--cr-down) 25%, transparent)"  },
    draft:          { bg: "var(--cr-paper-3)",   color: "var(--cr-ink-4)",   border: "var(--cr-rule)"       },
  };
  const labelKeys: Record<string, string> = {
    active:         "dashboard.statusActive",
    pending_review: "dashboard.statusPendingReview",
    suspended:      "dashboard.statusSuspended",
    draft:          "dashboard.statusDraft",
  };
  const s = styles[status] || styles.draft;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "4px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {labelKeys[status] ? t(labelKeys[status]) : status.replace(/_/g, " ")}
    </span>
  );
}

// ── Shared btn styles ─────────────────────────────────────────────────────────

// Secondary: hairline outline pill, ink text. Primary: the one copper fill
// per view. --cr-band-ink resolves to the light paper tone in both themes,
// which is what "white on copper" means without a hex literal.
const outlineBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
  border: "1px solid var(--cr-paper-4)", background: "transparent",
  borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: "13px", color: "var(--cr-ink-2)", padding: "0 16px", minHeight: "40px",
  cursor: "pointer", textDecoration: "none",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
  background: "var(--cr-copper)", border: "none",
  borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
  fontSize: "13px", color: "var(--cr-band-ink)", padding: "0 16px", minHeight: "40px",
  cursor: "pointer", textDecoration: "none",
};

// Tertiary: quiet text + arrow. For actions that matter but must not compete
// with the pills -- four identical pills in a row is noise, not hierarchy.
const tertiaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "4px",
  background: "transparent", border: "none",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: "12px", color: "var(--cr-copper)", padding: "0 4px",
  minHeight: "40px", cursor: "pointer", textDecoration: "none",
};

// Every panel on this surface is the same object: paper, hairline, 4px, 24
// internals. Naming it once stops the twelfth panel from inventing a
// thirteenth padding.
const panel: React.CSSProperties = {
  background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)",
  borderRadius: "4px", padding: "24px",
};

// One rhythm per surface: 64 between major sections, 24 between the blocks
// inside one, 16 inside a block, 8 from a label to its value.
const stack24: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "24px" };

/**
 * Cancels the outer margin an imported panel carries from the surface it was
 * first written for (CapTableCard's mb-6, MetricsRecorder's marginTop). Those
 * margins land on top of this page's 24px gap and turn it into 40 or 48, and
 * the components are shared with pages this pass must not touch. Flex items
 * do not collapse margins, so the correction holds whether the child renders
 * or returns null.
 */
function Flush({ top = 0, bottom = 0, children }: { top?: number; bottom?: number; children: React.ReactNode }) {
  return <div style={{ marginTop: top ? `-${top}px` : undefined, marginBottom: bottom ? `-${bottom}px` : undefined }}>{children}</div>;
}

// ── Visibility feature rows ───────────────────────────────────────────────────

const VIS_ROWS = [
  { labelKey: "dashboard.visName",       tipKey: "pricing.tipVisName",      always: true },
  { labelKey: "dashboard.visTeam",       tipKey: "pricing.tipVisTeam",      tier: "Starter", key: "docs" },
  { labelKey: "dashboard.visDeck",       tipKey: "pricing.tipVisDeck",      tier: "Starter", key: "docs" },
  { labelKey: "dashboard.visMessaging",  tipKey: "pricing.tipMessaging",    tier: "Starter", key: "docs" },
  { labelKey: "dashboard.visFinancials", tipKey: "pricing.tipFinancials",   tier: "Growth",  key: "growth" },
  { labelKey: "dashboard.visDemo",       tipKey: "pricing.tipDemoVideo",    tier: "Growth",  key: "growth" },
  { labelKey: "dashboard.visAiScore",    tipKey: "pricing.tipAiScore",      tier: "Growth",  key: "growth" },
] as const;

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Which investors have saved this listing.
 *
 * The dashboard could already show *how many* saves a listing had, which tells a
 * founder that interest exists but nothing they can act on. `seeInvestorIdentity`
 * has been a plan capability from the start and "Upgrade to see who" has sat in
 * all fifteen locale files -- with no feature behind either. This is it.
 *
 * Locked plans still see the count and the names blurred out: the point of the
 * gate is to make the upgrade legible, not to pretend nobody is interested.
 */
/**
 * The interaction ledger (migration 107): what people DID with the listing
 * beyond viewing -- website clicks, video plays, booking opens, shares -- plus
 * the three signals that were tracked but shown nowhere: interest, waitlist,
 * conversations. Counts only, no identity, so it is ungated like the stat
 * tiles; renders nothing until something has happened.
 */
/**
 * The match radar: live demand for THIS round, counted from the preferences
 * investors published. A founder opens the dashboard and sees "37 of 131
 * investors fit what you are raising" -- the marketplace working for them,
 * stated in one number. Identities stay behind the directory and its gates.
 */
function MatchRadar() {
  const { t } = useTranslation();
  const [data, setData] = useState<{ count: number; byType: Record<string, number>; total: number } | null>(null);

  useEffect(() => {
    fetch("/api/startups/match-radar")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data || data.count === 0) return null;
  const types = Object.entries(data.byType).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "16px" }}>
            {t("radar.title")}
          </h3>
          {/* Stepped down from 32px: this is the loudest figure on the
              investor tab, but it is still a supporting figure next to the
              profile-views headline that sits above every tab. */}
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "22px", color: "var(--cr-copper)", marginRight: "8px", fontVariantNumeric: "tabular-nums" }}>{data.count}</span>
            {t("radar.ofTotal", { total: data.total })}
          </p>
        </div>
        <Link href="/investors" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none", minHeight: "40px", display: "inline-flex", alignItems: "center" }}>
          {t("radar.browse")} {"\u2192"}
        </Link>
      </div>
      {types.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--cr-rule)" }}>
          {types.map(([type, n]) => (
            <span key={type} style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", border: "1px solid var(--cr-paper-4)", borderRadius: "3px", padding: "4px 8px" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "11px", color: "var(--cr-ink-2)" }}>{n}</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{type.replace(/_/g, " ")}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EngagementPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    events: Record<string, number>;
    interest: number; waitlist: number; conversations: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/startups/engagement")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  const ev = data.events ?? {};
  const rows: Array<[string, number]> = [
    [t("engagement.website"),       ev.website_click ?? 0],
    [t("engagement.video"),         ev.video_play ?? 0],
    [t("engagement.booking"),       ev.booking_open ?? 0],
    [t("engagement.shares"),        (ev.share_copy ?? 0) + (ev.share_social ?? 0)],
    [t("engagement.onepager"),      ev.onepager_open ?? 0],
    [t("engagement.interest"),      data.interest],
    [t("engagement.waitlist"),      data.waitlist],
    [t("engagement.conversations"), data.conversations],
  ].filter(([, v]) => (v as number) > 0) as Array<[string, number]>;
  if (!rows.length) return null;

  return (
    <div style={panel}>
      <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "16px" }}>
        {t("engagement.title")}
      </h3>
      {/* An instrument strip in miniature: each figure stands on its own
          hairline tick, no grid of boxed tiles. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))", rowGap: "24px" }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ borderLeft: "1px solid var(--cr-rule)", padding: "0 16px" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "22px", color: "var(--cr-ink-2)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: "8px" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SaversPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    savers: Array<{ slug: string; name: string | null; firm: string | null; savedAt: string }>;
    count: number;
    locked: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/startups/savers")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  // Nothing to say until it loads, and nothing worth a panel if no one has saved.
  if (!data || data.count === 0) return null;

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <h3 className="ruled-label" data-cr-visible="1">
          {t("dashboard.whoSaved")}
        </h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-2)", fontVariantNumeric: "tabular-nums" }}>{data.count}</span>
      </div>

      {data.locked ? (
        <>
          {/* Real shape, unreadable content -- the count is honest, the names
              are what the plan buys. */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }} aria-hidden>
            {Array.from({ length: Math.min(data.count, 3) }).map((_, i) => (
              <div key={i} style={{ height: "12px", width: `${55 + i * 12}%`, background: "var(--cr-paper-4)", borderRadius: "3px" }} />
            ))}
          </div>
          <Link href="/pricing" style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "16px", minHeight: "40px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
            {t("dashboard.upgradeSeeWho")} {"→"}
          </Link>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {data.savers.map((s) => (
            <Link key={s.slug} href={`/investors/${s.slug}`}
              style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", textDecoration: "none" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>
                {s.name}
                {s.firm && s.firm !== s.name && (
                  <span style={{ fontWeight: 300, color: "var(--cr-ink-4)" }}> · {s.firm}</span>
                )}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                {t("dashboard.savedOn", { date: formatDate(s.savedAt) })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Same idea as SaversPanel for profile *views*: startup_views has recorded
 * which investor looked at the listing since the Terms's §3 connection-proof
 * work, but founders only ever saw an aggregate count. Distinct investors,
 * last 30 days, identical gate and teaser treatment.
 */
function ViewersPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    viewers: Array<{ slug: string; name: string | null; firm: string | null; lastViewedAt: string }>;
    count: number;
    locked: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/startups/viewers")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <h3 className="ruled-label" data-cr-visible="1">
          {t("dashboard.whoViewed")}
        </h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-2)", fontVariantNumeric: "tabular-nums" }}>{data.count}</span>
      </div>

      {data.locked ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }} aria-hidden>
            {Array.from({ length: Math.min(data.count, 3) }).map((_, i) => (
              <div key={i} style={{ height: "12px", width: `${60 + i * 10}%`, background: "var(--cr-paper-4)", borderRadius: "3px" }} />
            ))}
          </div>
          <Link href="/pricing" style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "16px", minHeight: "40px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
            {t("dashboard.upgradeSeeWho")} {"→"}
          </Link>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {data.viewers.map((v) => (
            <Link key={v.slug} href={`/investors/${v.slug}`}
              style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", textDecoration: "none" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>
                {v.name}
                {v.firm && v.firm !== v.name && (
                  <span style={{ fontWeight: 300, color: "var(--cr-ink-4)" }}> · {v.firm}</span>
                )}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                {t("dashboard.viewedOn", { date: formatDate(v.lastViewedAt) })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The 30-day shape under a strip figure: the house sparkline, normalised.
 * Pure presentation: no axis, no numbers -- the count above it is the number;
 * this is its shape. Flat-zero histories render nothing rather than an empty
 * ruler.
 */
function ViewsSparkline({ series, width = 96, height = 20 }: { series: number[]; width?: number; height?: number }) {
  const max = Math.max(...series);
  if (max === 0) return null;
  // marginTop auto pins the shape to the strip's baseline, so every cell's
  // sparkline sits on the same line regardless of figure height above it.
  // Fixed pixel dimensions, never a percentage height -- the strip cell is an
  // auto-height flex column and a percentage would collapse to nothing.
  return (
    <div style={{ marginTop: "auto", paddingTop: "16px", maxWidth: "100%", overflow: "hidden" }}>
      <Sparkline points={series.map((v) => v / max)} width={width} height={height} />
    </div>
  );
}

/**
 * The founder's only question, answered at the top of the dashboard: how much
 * of the target is soft-circled (open term sheets) or committed (closed),
 * straight from the deal amounts. Renders nothing until any deal carries an
 * amount -- an empty ruler helps no one.
 */
function RaiseTracker({ target, softCircled, committed }: { target: number; softCircled: number; committed: number }) {
  const { t } = useTranslation();
  // Renders sensibly before the key lands in messages/; the orchestrated
  // dictionary pass replaces the fallback with the localized string.
  const tf = (key: string, fallback: string, vars?: Record<string, string | number>) => {
    const out = t(key, vars);
    return out === key ? fallback.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`)) : out;
  };
  if (!target) return null;
  if (softCircled === 0 && committed === 0) {
    // A target with nothing against it is an empty state, not an absent
    // panel: say what the meter will read and the one place it starts.
    // The action is a copper link, not a filled pill -- RoundControls below
    // already holds this tab's one copper fill.
    return (
      <EmptyState
        title={tf("dashboard.raiseEmptyTitle", "Nothing on the meter yet")}
        body={tf("dashboard.raiseEmptyBody", "This will read {target} raised as offers are accepted and deals carry amounts.", { target: formatCurrency(target, true) })}
        action={
          <Link href="/dashboard/startup/offers" style={{ display: "inline-flex", alignItems: "center", minHeight: "40px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>
            {t("dashboard.offersInbox")} {"→"}
          </Link>
        }
      />
    );
  }
  const pctC = Math.min(100, (committed / target) * 100);
  const pctS = Math.min(100 - pctC, (softCircled / target) * 100);
  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
        <h3 className="ruled-label" data-cr-visible="1">
          {t("dashboard.raiseProgress")}
          <InfoTip termKey={tipKey(t, RAISE_TIP.key, RAISE_TIP.fallback)} />
        </h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums" }}>
          {formatCurrency(committed + softCircled, true)} <span style={{ fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-4)" }}>/ {formatCurrency(target, true)}</span>
        </span>
      </div>
      <div style={{ height: "8px", background: "var(--cr-paper-4)", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${pctC}%`, background: "var(--cr-up)" }} />
        <div style={{ width: `${pctS}%`, background: "var(--cr-copper)", opacity: 0.75 }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "12px" }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-3)" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--cr-up)", marginRight: 4 }} />
          {t("dashboard.committed")}: {formatCurrency(committed, true)}
        </span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-3)" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--cr-copper)", opacity: 0.75, marginRight: 4 }} />
          {t("dashboard.softCircled")}: {formatCurrency(softCircled, true)}
        </span>
      </div>
    </div>
  );
}

/**
 * The overview's one-line answer to "how is my raise going", from props the
 * page already holds. The strip above carries interest (views, saves, deals),
 * the completion panel below carries the next action; this band carries the
 * money, so arrival reads raise -> interest -> next step without a tab
 * change. The full tracker stays one tab away -- this is a glance, so the
 * figure sits at the 22px supporting step: the 48px headline above is the
 * view's one loudest number.
 */
function RaiseGlance({ target, softCircled, committed, live, onOpenRaise }: { target: number; softCircled: number; committed: number; live: boolean; onOpenRaise: () => void }) {
  const { t } = useTranslation();
  const tf = (key: string, fallback: string) => {
    const out = t(key);
    return out === key ? fallback : out;
  };
  const total = committed + softCircled;
  // A listing that is not live cannot receive the offers this band counts,
  // so promising a zero would be a lie about the next step: the draft and
  // review banners above already own that state. Money already on the
  // record still shows regardless.
  if (!target || (!live && total === 0)) return null;
  const pctC = Math.min(100, (committed / target) * 100);
  const pctS = Math.min(100 - pctC, (softCircled / target) * 100);
  return (
    <div style={{ borderTop: "1px solid var(--cr-rule)", borderBottom: "1px solid var(--cr-rule)", padding: "24px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "8px" }}>
            {t("dashboard.raiseProgress")}
            {/* Same key as the full tracker: one figure, one definition. */}
            <InfoTip termKey={tipKey(t, RAISE_TIP.key, RAISE_TIP.fallback)} />
          </h3>
          <p style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "22px", lineHeight: 1, color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(total, true)}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-4)", fontVariantNumeric: "tabular-nums" }}>/ {formatCurrency(target, true)}</span>
          </p>
        </div>
        {/* A tab switch, not a route: the number stays a real link without
            the page moving underneath it. */}
        <button type="button" onClick={onOpenRaise} style={tertiaryBtn}>
          {t("sections.raiseProgress")} <span aria-hidden>{"→"}</span>
        </button>
      </div>
      {total > 0 ? (
        /* Same split as the full tracker: green is money that landed,
           copper-tinted is money spoken for -- direction, never decoration. */
        <div style={{ height: "4px", background: "var(--cr-paper-4)", borderRadius: "2px", overflow: "hidden", display: "flex", marginTop: "16px" }}>
          <div style={{ width: `${pctC}%`, background: "var(--cr-up)" }} />
          <div style={{ width: `${pctS}%`, background: "var(--cr-copper)", opacity: 0.75 }} />
        </div>
      ) : (
        /* The zero is stated with the target it counts toward, and the one
           action that moves it sits in the same breath. */
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "12px", lineHeight: 1.5 }}>
          {tf("dashboard.raiseGlanceEmpty", "Moves when an offer is accepted -- the first one starts the count.")}{" "}
          <Link href="/dashboard/startup/offers" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none", whiteSpace: "nowrap" }}>
            {t("dashboard.offersInbox")} {"→"}
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * B16 + B19: the founder's own levers on a live round. Round state (open /
 * oversubscribed / paused / closed) is separate from admin moderation; the
 * momentum toggle publishes an aggregate progress bar on the listing.
 */
function RoundControls({ startup }: { startup: Startup }) {
  const { t } = useTranslation();
  const router = useRouter();
  const st = startup as unknown as { round_state?: string | null; show_momentum?: boolean | null; slug: string };
  const [state, setState] = useState<string>(st.round_state ?? "open");
  const [momentum, setMomentum] = useState<boolean>(!!st.show_momentum);
  const [busy, setBusy] = useState(false);
  const STATES: Array<[string, string]> = [["open", t("startupDetail.round_open")], ["oversubscribed", t("startupDetail.round_oversubscribed")], ["paused", t("startupDetail.round_paused")], ["closed", t("startupDetail.round_closed")]];
  async function save(patch: { roundState?: string; showMomentum?: boolean }) {
    setBusy(true);
    const res = await fetch("/api/startups/round-state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(false);
    if (!res.ok) { notify.error(t("errors.generic")); return; }
    if (patch.roundState) setState(patch.roundState);
    if (patch.showMomentum !== undefined) setMomentum(patch.showMomentum);
    notify.success(t("dashboard.roundSaved"));
    router.refresh();
  }
  if (startup.status !== "active") return null;
  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <h3 className="ruled-label" data-cr-visible="1">{t("dashboard.roundStatusTitle")}</h3>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{t("dashboard.roundStatusHint")}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
        {STATES.map(([v, label]) => (
          <button key={v} disabled={busy} onClick={() => v !== state && save({ roundState: v })} aria-pressed={v === state}
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", minHeight: "40px", padding: "0 16px", borderRadius: "999px", cursor: "pointer",
              background: v === state ? "var(--cr-copper)" : "transparent", color: v === state ? "var(--cr-band-ink)" : "var(--cr-ink-3)", border: `1px solid ${v === state ? "var(--cr-copper)" : "var(--cr-paper-4)"}` }}>
            {label}
          </button>
        ))}
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", marginBottom: "16px", lineHeight: 1.5 }}>
        {t(`dashboard.roundHelp_${state}`)}
      </p>
      <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", paddingTop: "16px", borderTop: "1px solid var(--cr-rule)" }}>
        <input type="checkbox" checked={momentum} disabled={busy} onChange={(e) => save({ showMomentum: e.target.checked })} style={{ marginTop: 4, accentColor: "var(--cr-copper)" }} />
        <span>
          <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>{t("dashboard.momentumToggle")}</span>
          <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: 4 }}>{t("dashboard.momentumHint")}</span>
        </span>
      </label>
    </div>
  );
}

/** B25: the raise funnel from tables that already exist. */
function RaiseFunnel({ views, saves, deals, termSheets, closed }: { views: number; saves: number; deals: number; termSheets: number; closed: number }) {
  const { t } = useTranslation();
  const steps: Array<[string, number]> = [[t("dashboard.funnelViews"), views], [t("dashboard.funnelSaves"), saves], [t("dashboard.funnelDeals"), deals], [t("dashboard.funnelTermSheets"), termSheets], [t("dashboard.funnelClosed"), closed]];
  const max = Math.max(1, ...steps.map(([, v]) => v));
  if (views === 0 && deals === 0) return null;
  return (
    <div style={panel}>
      <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "16px" }}>{t("dashboard.funnelTitle")}</h3>
      <div style={{ display: "grid", gap: "12px" }}>
        {steps.map(([label, v], i) => {
          const prev = i > 0 ? steps[i - 1][1] : null;
          const conv = prev && prev > 0 ? Math.round((v / prev) * 100) : null;
          return (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 96px) 1fr 56px 48px", alignItems: "center", gap: "12px" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)" }}>{label}</span>
              {/* Only the last step is green: money that actually landed.
                  Two accent colours across five bars was three too many. */}
              <div style={{ height: "8px", background: "var(--cr-paper-4)", borderRadius: "4px", overflow: "hidden" }}>
                <div className="animate-draw-bar" style={{ ["--bar-width" as string]: `${(v / max) * 100}%`, width: `${(v / max) * 100}%`, height: "100%", background: i === steps.length - 1 ? "var(--cr-up)" : "var(--cr-copper)", opacity: i === steps.length - 1 ? 1 : 0.75 }} />
              </div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", textAlign: "right" }}>{v.toLocaleString()}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "10px", color: "var(--cr-ink-4)", textAlign: "right" }}>{conv !== null ? `${conv}%` : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** B20: the founder's question queue -- unanswered first, asker named. */
function QuestionQueue() {
  const { t } = useTranslation();
  type Q = { id: string; question: string; answer: string | null; answered_at: string | null; is_private: boolean; created_at: string; investor: { slug: string; display_name: string | null; firm_name: string | null } | null };
  const [items, setItems] = useState<Q[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { a: string; priv: boolean; busy?: boolean }>>({});
  useEffect(() => {
    fetch("/api/questions").then((r) => (r.ok ? r.json() : null)).then((j) => setItems(j?.questions ?? [])).catch(() => setItems([]));
  }, []);
  if (!items || items.length === 0) return null;
  const open = items.filter((q) => !q.answer);
  const answered = items.filter((q) => !!q.answer);
  async function answer(id: string) {
    const d = drafts[id]; if (!d?.a.trim()) return;
    setDrafts((p) => ({ ...p, [id]: { ...d, busy: true } }));
    const res = await fetch("/api/questions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, answer: d.a, isPrivate: d.priv }) });
    if (res.ok) {
      setItems((prev) => prev?.map((q) => q.id === id ? { ...q, answer: d.a, answered_at: new Date().toISOString(), is_private: d.priv } : q) ?? prev);
      notify.success(t("startupDetail.answered"));
    } else { notify.error(t("errors.generic")); setDrafts((p) => ({ ...p, [id]: { ...d, busy: false } })); }
  }
  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: "16px" }}>
        <h3 className="ruled-label" data-cr-visible="1">{t("dashboard.qaQueueTitle")}</h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "11px", color: open.length ? "var(--cr-copper)" : "var(--cr-ink-4)" }}>{t("dashboard.qaOpenCount", { count: open.length })}</span>
      </div>
      <div style={{ display: "grid" }}>
        {open.map((q) => {
          const d = drafts[q.id] ?? { a: "", priv: false };
          const who = q.investor?.display_name || q.investor?.firm_name || t("deals.investorFallback");
          return (
            <div key={q.id} style={{ borderTop: "1px solid var(--cr-rule)", padding: "16px 0" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "4px" }}><span style={{ color: "var(--cr-copper)", fontWeight: 700 }}>Q&nbsp;</span>{q.question}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "12px" }}>
                {t("startupDetail.askedBy")}{" "}
                {q.investor ? <Link href={`/investors/${q.investor.slug}`} style={{ color: "var(--cr-copper)", textDecoration: "none", fontWeight: 500 }}>{who}</Link> : who}
                {" · "}{formatDate(q.created_at)}
              </p>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <textarea value={d.a} onChange={(e) => setDrafts((p) => ({ ...p, [q.id]: { ...d, a: e.target.value } }))} rows={2} maxLength={3000} placeholder={t("startupDetail.answerPh")}
                  style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "8px 12px", outline: "none", resize: "vertical" }} />
                <button disabled={!!d.busy || !d.a.trim()} onClick={() => answer(q.id)}
                  style={{ border: "none", background: "var(--cr-copper)", color: "var(--cr-band-ink)", borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", minHeight: "40px", padding: "0 16px", cursor: "pointer", opacity: !d.a.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
                  {d.busy ? "…" : t("startupDetail.answerSend")}
                </button>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginTop: "8px", minHeight: "40px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-3)" }}>
                <input type="checkbox" checked={d.priv} onChange={(e) => setDrafts((p) => ({ ...p, [q.id]: { ...d, priv: e.target.checked } }))} style={{ accentColor: "var(--cr-copper)" }} />
                {t("startupDetail.answerPrivately")}
              </label>
            </div>
          );
        })}
        {answered.length > 0 && (
          <details style={{ borderTop: "1px solid var(--cr-rule)", paddingTop: "16px" }}>
            <summary style={{ cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.qaAnsweredCount", { count: answered.length })}</summary>
            <div style={{ display: "grid", marginTop: "12px" }}>
              {/* Answered rows split by rules, not boxes-in-boxes. */}
              {answered.map((q) => (
                <div key={q.id} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)", padding: "12px 0", borderTop: "1px solid var(--cr-rule)" }}>
                  <span style={{ color: "var(--cr-ink)", fontWeight: 500 }}>{q.question}</span> · {q.answer}
                  {q.is_private && <span style={{ marginLeft: 8, fontSize: "10px", color: "var(--cr-ink-4)" }}>({t("startupDetail.privateAnswer")})</span>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/** B24: NDA & signature roster -- who signed what, when. */
function NdaRoster() {
  const { t } = useTranslation();
  type Row = { id: string; signedAt: string | null; method: string; version: string | null; ip: string; investor: { slug: string; name: string | null } | null };
  type Sig = { id: string; contractType: string; contractStatus: string; signerName: string; signedAt: string; ip: string; isYou: boolean; dealId: string };
  const [data, setData] = useState<{ nda: Row[]; signatures: Sig[] } | null>(null);
  useEffect(() => { fetch("/api/nda/roster").then((r) => (r.ok ? r.json() : null)).then((j) => setData(j ?? { nda: [], signatures: [] })).catch(() => setData({ nda: [], signatures: [] })); }, []);
  if (!data || (data.nda.length === 0 && data.signatures.length === 0)) return null;
  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows: string[][] = [["type", "party", "document", "status", "signed_at", "method", "version", "ip"]];
    data!.nda.forEach((r) => rows.push(["NDA", r.investor?.name ?? "", "NDA", "signed", r.signedAt ?? "", r.method, r.version ?? "", r.ip]));
    data!.signatures.forEach((s) => rows.push(["Contract", s.signerName + (s.isYou ? " (you)" : ""), s.contractType, s.contractStatus, s.signedAt, "e-signature", "", s.ip]));
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = "capitalreach-signature-roster.csv"; a.click(); URL.revokeObjectURL(url);
  }
  // Dense rows get air, never fewer columns: 12px top and bottom is the row
  // rhythm inside a table block on this surface.
  const cell: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-2)", padding: "12px 16px 12px 0", borderBottom: "1px solid var(--cr-rule)", whiteSpace: "nowrap" };
  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: "8px" }}>
        <h3 className="ruled-label" data-cr-visible="1">{t("dashboard.rosterTitle")}</h3>
        <button onClick={exportCsv} style={{ background: "none", border: "1px solid var(--cr-paper-4)", borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", minHeight: "40px", padding: "0 16px", cursor: "pointer" }}>{t("dashboard.exportCsv")}</button>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "16px" }}>{t("dashboard.rosterHint")}</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{[t("dashboard.rosterType"), t("dashboard.rosterParty"), t("dashboard.rosterWhen"), t("dashboard.rosterMethod"), "IP"].map((h) => <th key={h} style={{ ...cell, padding: "0 16px 8px 0", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cr-ink-4)", textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {data.nda.map((r) => (
              <tr key={r.id}>
                <td style={cell}>NDA{r.version ? ` v${r.version}` : ""}</td>
                <td style={cell}>{r.investor ? <Link href={`/investors/${r.investor.slug}`} style={{ color: "var(--cr-copper)", textDecoration: "none" }}>{r.investor.name || t("deals.investorFallback")}</Link> : "—"}</td>
                <td style={{ ...cell, fontFamily: "'JetBrains Mono', monospace" }}>{r.signedAt ? new Date(r.signedAt).toLocaleString() : "—"}</td>
                <td style={cell}>{r.method}</td>
                <td style={{ ...cell, fontFamily: "'JetBrains Mono', monospace" }}>{r.ip}</td>
              </tr>
            ))}
            {data.signatures.map((s) => (
              <tr key={s.id}>
                <td style={cell}>{s.contractType.replace(/_/g, " ")} · {s.contractStatus}</td>
                <td style={cell}>{s.signerName}{s.isYou ? ` (${t("common.you")})` : ""}</td>
                <td style={{ ...cell, fontFamily: "'JetBrains Mono', monospace" }}>{new Date(s.signedAt).toLocaleString()}</td>
                <td style={cell}>e-signature</td>
                <td style={{ ...cell, fontFamily: "'JetBrains Mono', monospace" }}>{s.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The raise's other direction: investors this startup is pursuing. */
function TargetsPanel() {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<Array<{ id: string; slug: string; name: string | null; firm: string | null; note: string | null; status: string; investorId?: string; nextContactAt?: string | null }> | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  async function patchTarget(tg: { id: string; investorId?: string }, patch: { note?: string | null; nextContactAt?: string | null }) {
    const res = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId: tg.investorId, ...patch }) });
    if (!res.ok) { notify.error(t("errors.generic")); return false; }
    setTargets((prev) => prev?.map((x) => x.id === tg.id ? { ...x, ...(patch.note !== undefined ? { note: patch.note } : {}), ...(patch.nextContactAt !== undefined ? { nextContactAt: patch.nextContactAt } : {}) } : x) ?? prev);
    return true;
  }
  async function removeTarget(tg: { id: string; investorId?: string }) {
    const res = await fetch("/api/targets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId: tg.investorId }) });
    if (!res.ok) { notify.error(t("errors.generic")); return; }
    setTargets((prev) => prev?.filter((x) => x.id !== tg.id) ?? prev);
  }
  const STATUS_ORDER = ["to_contact", "contacted", "replied", "passed"] as const;
  const STATUS_STYLE: Record<string, { label: string; color: string }> = {
    to_contact: { label: "dashboard.tsToContact", color: "var(--cr-ink-4)"  },
    contacted:  { label: "dashboard.tsContacted", color: "var(--cr-copper)" },
    replied:    { label: "dashboard.tsReplied",   color: "var(--verdigris)" },
    passed:     { label: "dashboard.tsPassed",    color: "var(--cr-down)"   },
  };

  useEffect(() => {
    fetch("/api/targets")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setTargets(j?.targets ?? null))
      .catch(() => setTargets(null));
  }, []);

  if (!targets || targets.length === 0) return null;

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <h3 className="ruled-label" data-cr-visible="1">
          {t("dashboard.yourTargets")}
        </h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-2)", fontVariantNumeric: "tabular-nums" }}>{targets.length}</span>
      </div>
      {/* Rows split by hairlines with 12px of air, not glued together: the
          list is long and each row carries three controls. */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {targets.map((tg) => (
          <div key={tg.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "12px 0", borderTop: "1px solid var(--cr-rule)" }}>
            <Link href={`/investors/${tg.slug}`}
              style={{ display: "flex", flexDirection: "column", gap: "4px", textDecoration: "none", minWidth: 0 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>
                {tg.name}
                {tg.firm && tg.firm !== tg.name && (
                  <span style={{ fontWeight: 300, color: "var(--cr-ink-4)" }}> · {tg.firm}</span>
                )}
              </span>
            </Link>
            {/* B22: inline note + next-contact date + remove. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
              {editingNote === tg.id ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} maxLength={1000} placeholder={t("dashboard.tgNotePh")} autoFocus
                    onKeyDown={async (e) => { if (e.key === "Enter") { if (await patchTarget(tg, { note: noteDraft })) setEditingNote(null); } if (e.key === "Escape") setEditingNote(null); }}
                    style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink)", padding: "4px 8px", outline: "none" }} />
                  <button onClick={async () => { if (await patchTarget(tg, { note: noteDraft })) setEditingNote(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-copper)" }}>{t("common.save")}</button>
                </div>
              ) : (
                <button onClick={() => { setEditingNote(tg.id); setNoteDraft(tg.note ?? ""); }} title={t("common.edit")}
                  style={{ background: "none", border: "none", padding: 0, cursor: "text", textAlign: "left", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: tg.note ? "var(--cr-ink-4)" : "var(--cr-paper-4)" }}>
                  {tg.note || t("dashboard.tgNotePh")}
                </button>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="date" value={tg.nextContactAt ?? ""} onChange={(e) => patchTarget(tg, { nextContactAt: e.target.value || null })} title={t("dashboard.tgNextContact")}
                  style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: tg.nextContactAt && new Date(tg.nextContactAt) < new Date() ? "var(--cr-down)" : "var(--cr-ink-3)", padding: "4px 8px", outline: "none" }} />
                <button onClick={() => removeTarget(tg)} title={t("common.delete")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", padding: 0 }}><X style={{ width: 12, height: 12 }} /></button>
              </div>
            </div>
            <button
              onClick={async () => {
                const prevStatus = tg.status;
                const next = STATUS_ORDER[(STATUS_ORDER.indexOf(tg.status as typeof STATUS_ORDER[number]) + 1) % STATUS_ORDER.length];
                setTargets((prev) => prev?.map(x => x.id === tg.id ? { ...x, status: next } : x) ?? prev);
                try {
                  const res = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId: tg.investorId, status: next }) });
                  if (!res.ok) throw new Error();
                } catch {
                  setTargets((prev) => prev?.map(x => x.id === tg.id ? { ...x, status: prevStatus } : x) ?? prev);
                  notify.error(t("errors.generic"));
                }
              }}
              title={t("dashboard.tsCycle")}
              style={{ background: "transparent", border: `1px solid ${STATUS_STYLE[tg.status]?.color ?? "var(--cr-rule-dark)"}`, color: STATUS_STYLE[tg.status]?.color ?? "var(--cr-ink-4)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "4px 8px", cursor: "pointer", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
              {t(STATUS_STYLE[tg.status]?.label ?? "dashboard.tsToContact")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The update composer: title + body, publish notifies every saver (the API
 * does the fan-out). The founder's periodic heartbeat to their audience.
 */
function UpdateComposer() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"watchers" | "deals" | "all">("all");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);

  async function draftWithAi() {
    if (drafting) return;
    setDrafting(true);
    const res = await fetch("/api/ai/draft-update", { method: "POST" }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setDrafting(false);
    if (!res?.ok) { notify.error(j?.error || t("errors.generic")); return; }
    // A draft never overwrites typing -- it fills the empty seat only.
    if (!body.trim()) setBody(j.draft);
    else setBody(b => b + "\n\n" + j.draft);
    if (!title.trim()) setTitle(t("dashboard.updDraftTitle"));
  }
  // B21: history with edit / delete. Write-only before.
  type Upd = { id: string; title: string; body: string; audience: string; created_at: string; updated_at: string | null };
  const [history, setHistory] = useState<Upd[]>([]);
  const [editing, setEditing] = useState<{ id: string; title: string; body: string } | null>(null);
  useEffect(() => { fetch("/api/updates").then((r) => (r.ok ? r.json() : null)).then((j) => setHistory(j?.updates ?? [])).catch(() => {}); }, []);

  async function publish() {
    if (busy || !title.trim() || !body.trim()) return;
    setBusy(true);
    const res = await fetch("/api/updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, audience }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(t("dashboard.updFailed")); return; }
    notify.success(t("dashboard.updPosted"));
    if (j.update) setHistory((h) => [{ ...j.update, audience }, ...h]);
    setTitle(""); setBody(""); setOpen(false);
  }
  async function saveEdit() {
    if (!editing || !editing.title.trim() || !editing.body.trim()) return;
    const res = await fetch("/api/updates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, title: editing.title, body: editing.body }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.update) { notify.error(t("errors.generic")); return; }
    setHistory((h) => h.map((u) => (u.id === editing.id ? j.update : u)));
    setEditing(null);
    notify.success(t("dashboard.updEdited"));
  }
  async function remove(id: string) {
    if (!window.confirm(t("dashboard.updDeleteConfirm"))) return;
    const res = await fetch("/api/updates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) { notify.error(t("errors.generic")); return; }
    setHistory((h) => h.filter((u) => u.id !== id));
  }
  const AUD_KEY: Record<string, string> = { watchers: "dashboard.audWatchers", deals: "dashboard.audDeals", all: "dashboard.audAll" };

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <h3 className="ruled-label" data-cr-visible="1">{t("dashboard.postUpdate")}</h3>
        {!open && (
          <button onClick={() => setOpen(true)}
            style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", minHeight: "40px", padding: "0 16px", cursor: "pointer" }}>
            {t("dashboard.postUpdate")}
          </button>
        )}
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={150} placeholder={t("dashboard.updTitle")}
            style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)", padding: "12px", outline: "none" }} />
          <button onClick={draftWithAi} disabled={drafting}
            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", borderRadius: 4, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 11, minHeight: "40px", padding: "0 12px", cursor: drafting ? "wait" : "pointer" }}>
            ✦ {drafting ? t("common.loading") : t("dashboard.updDraftAi")}
          </button>
          <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={5000} rows={4} placeholder={t("dashboard.updBody")}
            style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "12px", outline: "none", resize: "vertical" }} />
          {/* Audience: savers, deal investors (closed included), or both. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginRight: 4 }}>{t("dashboard.audienceLabel")}</span>
            {(["all", "watchers", "deals"] as const).map((a) => (
              <button key={a} type="button" onClick={() => setAudience(a)} aria-pressed={audience === a}
                style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", minHeight: "40px", padding: "0 16px", borderRadius: "999px", cursor: "pointer", background: audience === a ? "var(--cr-copper)" : "transparent", color: audience === a ? "var(--cr-band-ink)" : "var(--cr-ink-3)", border: `1px solid ${audience === a ? "var(--cr-copper)" : "var(--cr-paper-4)"}` }}>
                {t(AUD_KEY[a])}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button onClick={() => setOpen(false)}
              style={{ border: "1px solid var(--cr-paper-4)", background: "transparent", color: "var(--cr-ink-3)", borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", minHeight: "40px", padding: "0 16px", cursor: "pointer" }}>
              {t("common.cancel")}
            </button>
            <button onClick={publish} disabled={busy || !title.trim() || !body.trim()}
              style={{ border: "none", background: "var(--cr-copper)", color: "var(--cr-band-ink)", borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", minHeight: "40px", padding: "0 16px", cursor: busy ? "wait" : "pointer", opacity: !title.trim() || !body.trim() ? 0.5 : 1 }}>
              {busy ? t("common.saving") : t("dashboard.updPost")}
            </button>
          </div>
        </div>
      )}
      {history.length > 0 && (
        /* Every past update stays reachable, one click behind the summary --
           the composer is the job, the archive is reference. */
        <details style={{ marginTop: "24px", borderTop: "1px solid var(--cr-rule)", paddingTop: "16px" }}>
          <summary style={{ cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.updHistory", { count: history.length })}</summary>
          {/* History rows split by rules -- no boxes-in-boxes inside a card. */}
          <div style={{ display: "grid", marginTop: "12px" }}>
            {history.map((u) => (
              <div key={u.id} style={{ borderTop: "1px solid var(--cr-rule)", padding: "16px 0" }}>
                {editing?.id === u.id ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={150}
                      style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", padding: "8px 12px", outline: "none" }} />
                    <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} maxLength={5000} rows={3}
                      style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "8px 12px", outline: "none", resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => setEditing(null)} style={{ background: "none", border: "1px solid var(--cr-paper-4)", borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", minHeight: "40px", padding: "0 16px", cursor: "pointer" }}>{t("common.cancel")}</button>
                      <button onClick={saveEdit} style={{ background: "var(--cr-copper)", border: "none", borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-band-ink)", minHeight: "40px", padding: "0 16px", cursor: "pointer" }}>{t("common.save")}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>{u.title}</p>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>{formatDate(u.created_at)}{u.updated_at ? ` · ${t("dashboard.updEditedTag")}` : ""}</span>
                    </div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{u.body}</p>
                    <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t(AUD_KEY[u.audience] ?? "dashboard.audWatchers")}</span>
                      <button onClick={() => setEditing({ id: u.id, title: u.title, body: u.body })} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-copper)", padding: 0 }}>{t("common.edit")}</button>
                      <button onClick={() => remove(u.id)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-down)", padding: 0 }}>{t("common.delete")}</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Which documents get opened, by how many investors (identity gated). */
function DocAnalyticsPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<{ docs: Array<{ id: string; label: string; opens: number; distinctViewers: number; viewers: Array<{ slug: string; name: string | null }> }>; locked: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/startups/doc-views").then(r => r.ok ? r.json() : null).then(setData).catch(() => setData(null));
  }, []);

  if (!data || data.docs.length === 0) return null;

  return (
    <div style={panel}>
      <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "16px" }}>{t("dashboard.docAnalytics")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {data.docs.map((d) => (
          <div key={d.id} style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>{d.label}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                {t("dashboard.docOpens", { opens: d.opens, viewers: d.distinctViewers })}
              </span>
            </div>
            {!data.locked && d.viewers.length > 0 && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                {d.viewers.map((v, i) => (
                  <Link key={v.slug} href={`/investors/${v.slug}`} style={{ color: "var(--cr-copper)", textDecoration: "none" }}>
                    {v.name}{i < d.viewers.length - 1 ? ", " : ""}
                  </Link>
                ))}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StartupDashboardClient({ profile, startup, analytics, isLaunchMode, viewingAs, rejectionReason = null, benchmarks = null }: Props) {
  const { t }        = useTranslation();
  const router       = useRouter();
  const [aiFeedback, setAiFeedback]           = useState<any>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [activeTab, setActiveTab]             = useState<StartupTab>("overview");
  // The signature is a listing-level record, not a step in a wizard: a founder
  // signs once, and again only when the wording changes. It is offered here
  // rather than wired into a submit gate so that an unsigned listing is
  // visible without a half-finished edit becoming unsubmittable.
  const [attestOpen, setAttestOpen] = useState(false);
  const [attestedAt, setAttestedAt] = useState<string | null>(null);

  // Arrival notices from onboarding/checkout. Read once from the URL --
  // welcome=1 greets, billing=soon explains why a paid pick landed on Free
  // (the alternative was bouncing founders to /pricing, where re-pressing
  // "select plan" once duplicated their listing on every press).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("billing") === "soon") notify.info(t("dashboard.billingSoon"));
    else if (q.get("welcome") === "1") notify.success(t("dashboard.welcomeToast"));
    else if (q.get("upgraded") === "1") notify.success(t("dashboard.upgradedToast"));
    if (q.get("welcome") || q.get("billing") || q.get("upgraded")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The overview used to carry seventeen panels in one column. They are all
  // still here; they are sorted by the question the founder is asking rather
  // than stacked in the order they were built.
  const TABS: { value: StartupTab; label: string }[] = [
    { value: "overview",  label: t("dashboard.overview")           },
    { value: "raise",     label: t("sections.raiseProgress")       },
    { value: "investors", label: t("sections.investorInterest")    },
    { value: "documents", label: t("dashboard.documents")          },
    { value: "ai",        label: t("dashboard.aiFeedback")         },
    { value: "billing",   label: t("dashboard.billing")            },
  ];

  // Weighted, so the number reflects how finished the listing looks to an
  // investor rather than how many boxes happen to be ticked, and `next` is
  // always the single heaviest thing still missing.
  const { percent: score, items: completenessItems, next: nextAction } = listingCompleteness(startup ?? {});
  const missing = startup
    ? completenessItems.filter((i) => !i.done)
    : [{ key: "onboarding", labelKey: "dashboard.ckOnboarding", weight: 100, done: false }];

  const tier             = startup?.subscription_tier || "free";
  const canDocs          = isLaunchMode || tier === "starter" || tier === "growth";
  const canGrowth        = isLaunchMode || tier === "growth";

  async function generatePitchFeedback() {
    if (!startup || viewingAs) return;
    setLoadingFeedback(true);
    try {
      const res = await fetch("/api/ai/pitch-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId: startup.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error || t("errors.generic"));
        return;
      }
      setAiFeedback(data);
    } catch {
      notify.error(t("errors.generic"));
    } finally {
      setLoadingFeedback(false);
    }
  }

  const [portalBusy, setPortalBusy] = useState(false);
  async function openBillingPortal() {
    if (viewingAs) return;
    if (portalBusy) return;
    setPortalBusy(true);
    try {
      const res = await fetch("/api/checkout/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      notify.error(data.error || t("errors.generic"));
    } catch {
      notify.error(t("errors.generic"));
    } finally { setPortalBusy(false); }
  }

  // ── No startup yet ──
  if (!startup) {
    return (
      <main style={{ background: "var(--cr-paper)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "64px 24px" }}>
        {/* One diamond, one sentence, one action -- the house empty state. */}
        <span aria-hidden style={{ fontSize: "22px", color: "var(--cr-copper)", marginBottom: "24px" }}>{"✦"}</span>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "28px", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "12px" }}>{t("dashboard.setUpProfile")}</h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", maxWidth: "400px", marginBottom: "24px" }}>
          {t("dashboard.setUpProfileSub")}
        </p>
        <Link href="/onboarding/startup" style={primaryBtn}>{t("dashboard.createYourProfile")}</Link>
      </main>
    );
  }

  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>

      {/* Unmistakable, and at the very top: an admin reading someone else's
          numbers must never mistake them for their own, and must be able to
          leave in one click. Every mutating control below is already gone. */}
      {viewingAs && (
        <div
          role="status"
          style={{
            background: "var(--cr-ink)", color: "var(--cr-paper)",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "12px", flexWrap: "wrap", padding: "12px 24px",
            fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <Eye style={{ width: 14, height: 14, color: "var(--cr-copper-l)" }} />
            {t("viewAs.banner", { name: viewingAs })}
          </span>
          <span style={{ opacity: 0.55, fontSize: "12px" }}>{t("viewAs.readOnly")}</span>
          <Link href="/admin" style={{ color: "var(--cr-copper-l)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}>
            {t("viewAs.exit")}
          </Link>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ borderBottom: "1px solid var(--cr-rule-dark)", position: "relative", overflow: "hidden" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 32px 32px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "24px", position: "relative" }}>
          <div>
            <div className="ruled-label" style={{ marginBottom: "8px" }}>{t("dashboard.startupDashboard")}</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 36px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "12px" }}>
              {startup.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <StatusBadge status={startup.status} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>
                {t("dashboard.tier", { tier })}
              </span>
            </div>
          </div>
          {/* One outlined pill, three quiet links. Four identical pills read as
              four equally urgent decisions; editing the listing is the only
              one of these that changes anything. */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/dashboard/startup/edit" style={outlineBtn}>
              {t("dashboard.editProfile")}
            </Link>
            <Link href={`/startups/${startup.slug}`} target="_blank" style={tertiaryBtn}>
              {t("dashboard.viewListing")} <span aria-hidden>{"→"}</span>
            </Link>
            {/* The unlocked owner view above lies by omission: it never shows
                what a real investor meets. This one does -- tier zeroed,
                documents locked, upgrade prompts visible. */}
            <Link href={`/startups/${startup.slug}?preview=investor`} target="_blank" style={tertiaryBtn}>
              {t("preview.open")} <span aria-hidden>{"→"}</span>
            </Link>
            <Link href={`/startups/${startup.slug}/one-pager`} target="_blank" style={tertiaryBtn}>
              {t("onePager.open")} <span aria-hidden>{"→"}</span>
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 32px 96px" }}>

        {/* Listing status banner -- one for every state, always at the top. */}
        {startup.status === "pending_review" && (
          <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "16px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle style={{ width: 16, height: 16, color: "var(--cr-copper)", flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{t("dashboard.profileUnderReview")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.reviewNote")}</p>
            </div>
          </div>
        )}
        {startup.status === "draft" && rejectionReason && (
          <div style={{ background: "var(--cr-down-bg)", border: "1px solid color-mix(in srgb, var(--cr-down) 25%, transparent)", borderRadius: "4px", padding: "16px", marginBottom: "32px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <AlertCircle style={{ width: 16, height: 16, color: "var(--cr-down)", flexShrink: 0, marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-down)" }}>{t("dashboard.statusRejectedTitle")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", marginTop: "4px", lineHeight: 1.5 }}>“{rejectionReason}”</p>
              <Link href="/dashboard/startup/edit" style={{ display: "inline-flex", alignItems: "center", minHeight: "40px", marginTop: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>{t("dashboard.editAndResubmit")} →</Link>
            </div>
          </div>
        )}
        {startup.status === "draft" && !rejectionReason && (
          <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "16px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <AlertCircle style={{ width: 16, height: 16, color: "var(--cr-copper)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{t("dashboard.statusDraftTitle")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.statusDraftBody")}</p>
            </div>
            <Link href="/dashboard/startup/edit" style={{ ...primaryBtn, fontSize: "12px", whiteSpace: "nowrap" }}>{t("dashboard.submitForReview")} →</Link>
          </div>
        )}

        {/* The founder's signature on their own figures. A hairline row, not a
            tinted banner: it is a standing task rather than something wrong,
            and the coloured slabs above are reserved for states that need
            attention today. */}
        <div style={{ borderBottom: "1px solid var(--cr-rule)", padding: "0 0 16px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("attest.dashTitle")}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", marginTop: "4px", lineHeight: 1.5 }}>{t("attest.dashBody")}</p>
          </div>
          {attestedAt ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-up)" }}>
              <CheckCircle2 style={{ width: 14, height: 14 }} /> {formatDate(attestedAt)}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAttestOpen(true)}
              style={{ ...primaryBtn, fontSize: "12px", whiteSpace: "nowrap", border: "none", cursor: "pointer" }}
            >
              {t("attest.dashCta")} →
            </button>
          )}
        </div>
        <FounderAttestationModal
          open={attestOpen}
          startupId={startup.id}
          onCancel={() => setAttestOpen(false)}
          onAttested={({ attestedAt: at }) => { setAttestedAt(at); setAttestOpen(false); }}
        />
        {startup.status === "active" && (
          /* Live is the everyday state, so it gets a hairline and a dot, not a
             tinted slab: a founder should not meet a coloured banner every
             morning for the news that nothing is wrong. Verdigris means
             settled -- green keeps meaning money direction and nothing else. */
          <div style={{ borderBottom: "1px solid var(--cr-rule)", padding: "0 0 16px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--verdigris)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--verdigris) 15%, transparent)", flexShrink: 0 }} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-3)", flex: 1, minWidth: 160 }}>{t("dashboard.statusLiveTitle")}</p>
            <Link href={`/startups/${startup.slug}`} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-4)", textDecoration: "none" }}>{t("dashboard.viewPublicListing")} →</Link>
          </div>
        )}
        {startup.status === "suspended" && (
          <div style={{ background: "var(--cr-down-bg)", border: "1px solid color-mix(in srgb, var(--cr-down) 25%, transparent)", borderRadius: "4px", padding: "16px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle style={{ width: 16, height: 16, color: "var(--cr-down)", flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-down)" }}>{t("dashboard.statusSuspendedTitle")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.statusSuspendedBody")}</p>
            </div>
          </div>
        )}

        {/* The instrument strip, re-ranked. Four cells of equal size is four
            headlines, which is none: profile views now takes the whole top
            row at 48px with its 30-day shape under it, and saves, deals and
            the AI score sit a full size down on a hairline row beneath. Every
            figure, sparkline, link and tooltip that was here is still here. */}
        <div style={{ borderTop: "1px solid var(--cr-rule-dark)", borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: "64px" }}>
          <div style={{ padding: "32px 24px" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
              {t("dashboard.profileViews")}
              {/* The headline says what it counts: visits, not visitors. A
                  founder reading 40 as forty interested investors is being
                  set up for the wrong conversation. */}
              <InfoTip termKey={tipKey(t, "glossary.profileViews", "How many times your listing was opened in the last 30 days. Every visit counts, so one returning investor can appear several times.")} />
            </p>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "48px", lineHeight: 1, color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {analytics.views}
            </p>
            {/* Pixel dimensions, never a percentage height: this cell is an
                auto-height block and a percentage would collapse to zero. */}
            {analytics.viewSeries && <ViewsSparkline series={analytics.viewSeries} width={240} height={40} />}
          </div>
          <div style={{ borderTop: "1px solid var(--cr-rule)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(176px, 1fr))", marginLeft: "-1px" }}>
              {[
                /* Saves are answered on the investors tab (who saved, and the
                   panels around it), so the count leads there rather than
                   sitting inert: a figure a founder can act on is a link. */
                { label: t("dashboard.investorSaves"), val: analytics.saves,                series: analytics.saveSeries, tab: "investors" as StartupTab, info: tipKey(t, "glossary.investorSaves", "Investors who bookmarked your listing to their watchlist. A save is interest you can act on; the investors tab shows the activity around it, and paid plans show who saved.") },
                { label: t("dashboard.activeDeals"),   val: analytics.deals,                series: analytics.dealSeries, href: "/deals", info: tipKey(t, "glossary.activeDeals", "Deals still in play: everything in the pipeline that has not yet been finalised and has not been passed, whatever stage it stands at.") },
                { label: t("dashboard.aiScore"),       val: startup.vaultrise_score ?? "—", info: "glossary.aiScore", dial: true },
              ].map(({ label, val, series, href, info, dial, tab }: { label: string; val: number | string; series?: number[]; href?: string; info?: string; dial?: boolean; tab?: StartupTab }) => {
                const open = href ? () => router.push(href) : tab ? () => setActiveTab(tab) : undefined;
                return (
                <div key={label} onClick={open}
                  role={open ? "link" : undefined} tabIndex={open ? 0 : undefined}
                  onKeyDown={open ? (e) => { if (e.key === "Enter") open(); } : undefined}
                  style={{ borderLeft: "1px solid var(--cr-rule)", padding: "24px", cursor: open ? "pointer" : "default", display: "flex", flexDirection: "column" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                    {label}
                    {/* The founder is being shown a number about their own
                        company that a model produced. They deserve to know what
                        it measures without leaving the page. */}
                    {info && <InfoTip termKey={info} />}
                    {open && <span aria-hidden style={{ color: "var(--cr-copper)", marginLeft: "8px" }}>→</span>}
                  </p>
                  {dial && typeof val === "number" ? (
                    /* Stepped down from 48: the dial is the loudest object in
                       this row otherwise, and the row is not the headline. */
                    <ScoreDial score={val} size={40} />
                  ) : (
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "22px", lineHeight: 1, color: "var(--cr-ink-2)", fontVariantNumeric: "tabular-nums" }}>{val}</p>
                  )}
                  {series && <ViewsSparkline series={series} />}
                </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tab bar. The cap table and the F10 benchmark band used to sit
            between the strip and this bar, so arrival meant three sections
            before the first tab -- both now live under "raise progress". */}
        <div style={{ borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: "32px", display: "flex", overflowX: "auto" }}>
          {TABS.filter(tab => tab.value !== "ai" || canGrowth).map(({ value, label }) => (
            <button key={value} aria-pressed={activeTab === value} onClick={() => setActiveTab(value)}
              style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: activeTab === value ? 600 : 300, fontSize: "13px", color: activeTab === value ? "var(--cr-ink)" : "var(--cr-ink-4)", minHeight: "40px", padding: "0 16px", whiteSpace: "nowrap", borderBottom: activeTab === value ? "2px solid var(--cr-copper)" : "2px solid transparent", transition: "color 100ms, border-color 100ms" }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Overview: the state of the listing itself ── */}
        {activeTab === "overview" && (
          <div style={stack24}>
          {/* The raise, first: the founder's question on arrival is answered
              before the housekeeping below gets a say. Hidden until a target
              exists -- the completion panel is what says to set one. */}
          <ErrorBoundary labelKey="sections.raiseProgress">
            <RaiseGlance
              target={startup.funding_target}
              softCircled={analytics.raise?.softCircled ?? 0}
              committed={analytics.raise?.committed ?? 0}
              live={startup.status === "active"}
              onOpenRaise={() => setActiveTab("raise")}
            />
          </ErrorBoundary>
          {/* 24px gap inline: the shared class carries 20px, which is off the
             4/8/12/16/24 scale -- this surface keeps the rhythm honest. */}
          <div className="grid-third-stack" style={{ gap: "24px", alignItems: "start" }}>
            {/* Profile completion */}
            <div style={panel}>
              <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "16px" }}>
                {t("dashboard.profileCompletion")}
                {/* The same InfoTip idiom the benchmark band uses: the meter
                    is weighted, and a founder chasing the wrong 3% because
                    they assumed a box count deserves to know that here. */}
                <InfoTip termKey={tipKey(t, "glossary.completeness", "Weighted by what investors look for, not a count of boxes ticked: heavier items move the number further, and the suggested next step is always the heaviest gap still open.")} />
              </h3>
              {/* 22px ink, not 32px copper. The headline on this page is
                  profile views; a second big copper number beside it is a
                  second headline, and two headlines is none. */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "12px" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{score}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>%</span>
              </div>
              {/* Progress track */}
              <div style={{ height: "3px", background: "var(--cr-paper-4)", borderRadius: "2px", marginBottom: "16px" }}>
                <div style={{ height: "3px", background: "var(--cr-copper)", borderRadius: "2px", width: `${score}%`, transition: "width 600ms ease" }} />
              </div>
              {missing.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--verdigris)" }}>
                  <CheckCircle2 style={{ width: 14, height: 14 }} /> {t("dashboard.profileComplete")}
                </div>
              ) : (
                <>
                  {/* One instruction, not a list of eleven. The heaviest miss
                      is the one worth doing, and it says what it is worth. */}
                  {nextAction && (
                    /* A left rule, not a box-in-box: the copper bar is the
                       ruled-label motif carrying emphasis inside the card. */
                    <div style={{ borderLeft: "2px solid var(--cr-copper)", paddingLeft: "12px", marginBottom: "24px" }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
                        {t("completeness.nextBest")}
                      </p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", lineHeight: 1.4 }}>
                        {t(nextAction.labelKey)}
                      </p>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", marginTop: "4px" }}>
                        {t("completeness.worth", { points: nextAction.weight })}
                      </p>
                    </div>
                  )}
                  {/* The full list of gaps, one click down. The next-best
                      action above is the instruction; this is the audit. */}
                  <details style={{ marginBottom: "16px" }}>
                    <summary style={{ cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)" }}>
                      {t("common.viewAll")}{" "}
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{missing.length}</span>
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                      {missing.map((m) => (
                        <div key={m.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--cr-paper-4)", flexShrink: 0 }} />
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>{t(m.labelKey)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              )}
              <Link href="/dashboard/startup/edit" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "40px", border: "1px solid var(--cr-paper-4)", borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-2)", textDecoration: "none", marginTop: "8px" }}>
                {t("dashboard.completeProfile")}
              </Link>
            </div>

            {/* Right col */}
            <div style={stack24}>
              {/* Quick actions -- rules divide the grid, not boxes-in-boxes,
                  and the labels stand without a row of repeated icons. */}
              <div style={panel}>
                <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "16px" }}>{t("dashboard.quickActions")}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "var(--cr-rule)" }}>
                  {[
                    /* Offers first, and across both columns. It is the only
                       screen where an incoming offer is answered, and an
                       accepted offer is what opens the conversation, so a
                       founder who cannot find it cannot be reached at all.
                       The span also keeps an odd count from leaving a bare
                       rule-coloured cell at the end of the grid. */
                    { href: "/dashboard/startup/offers",  label: t("dashboard.offersInbox"), wide: true },
                    { href: "/deals",                    label: t("dashboard.dealPipeline") },
                    { href: "/dashboard/messages",       label: t("dashboard.messages")    },
                    { href: "/dashboard/startup/edit",   label: t("dashboard.editProfile") },
                    { href: "/dashboard/team",           label: t("team.navLabel")        },
                    { href: "/pricing",                  label: t("dashboard.upgradePlan") },
                    { href: `/startups/${startup.slug}`, label: t("dashboard.publicView"), ext: true },
                  ].map(({ href, label, ext, wide }) => (
                    <Link key={label} href={href} {...(ext ? { target: "_blank" } : {})}
                      style={{ display: "flex", alignItems: "center", minHeight: "48px", background: "var(--cr-paper-2)", fontFamily: "'DM Sans', sans-serif", fontWeight: wide ? 500 : 400, fontSize: "12px", color: wide ? "var(--cr-ink)" : "var(--cr-ink-3)", padding: "0 12px", textDecoration: "none", ...(wide ? { gridColumn: "1 / -1" } : null) }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink)")}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = wide ? "var(--cr-ink)" : "var(--cr-ink-3)")}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Subscription -- quiet: the one primary in this column is the
                  visibility unlock below. */}
              <div style={{ ...panel, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", textTransform: "capitalize" }}>{t("dashboard.tier", { tier })}</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                    {tier === "free" ? t("dashboard.upgradeTierNote") : t("dashboard.activeSubscription")}
                  </p>
                </div>
                {tier === "free"
                  ? <Link href="/pricing" style={outlineBtn}>{t("common.upgrade")}</Link>
                  : viewingAs ? null : <button onClick={openBillingPortal} style={outlineBtn}>{t("dashboard.manage")}</button>}
              </div>

              {/* Profile visibility */}
              <div style={panel}>
                <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "16px" }}>{t("dashboard.profileVisibility")}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {VIS_ROWS.map((row) => {
                    const unlocked = "always" in row ? true : ("key" in row && row.key === "docs" ? canDocs : canGrowth);
                    return (
                      <div key={row.labelKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {/* Locked earns its lock; unlocked needs no medal.
                              A quiet verdigris point in the same 13px slot
                              keeps the column aligned without a stack of
                              repeated check icons. */}
                          {unlocked
                            ? <span aria-hidden style={{ width: 13, display: "inline-flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--verdigris)" }} /></span>
                            : <Lock style={{ width: 13, height: 13, color: "var(--cr-ink-4)", flexShrink: 0 }} />}
                          <span data-tip={t(row.tipKey)} tabIndex={0} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: unlocked ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>{t(row.labelKey)}</span>
                        </div>
                        {!unlocked && "tier" in row && (
                          <span style={{ background: "transparent", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "4px 8px" }}>
                            {row.tier}+
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {tier === "free" && (
                  /* The one copper fill on the overview. Everything else in
                     this column is a hairline outline or a quiet link. */
                  <Link href="/pricing" style={{ ...primaryBtn, display: "flex", justifyContent: "center", marginTop: "24px", width: "100%", boxSizing: "border-box" }}>
                    {t("dashboard.unlockProfileInfo")}
                  </Link>
                )}
              </div>
            </div>

            {/* The listing's own to-do list belongs with the listing. Spanning
                both columns because this grid is 1fr/2fr: panels dropped in
                loose used to auto-place into alternating column widths, which
                is most of why the overview looked like a pile. */}
            <div style={{ gridColumn: "1 / -1" }}>
              <Flush top={16}>
                <ErrorBoundary labelKey="sections.fundraiseChecklist"><FundraiseChecklist startup={startup} completeness={score} /></ErrorBoundary>
              </Flush>
            </div>
          </div>
          </div>
        )}

        {/* ── Raise progress: the round, its shape and its history ── */}
        {activeTab === "raise" && (
          <div style={stack24}>
            {startup && analytics.raise && (
              <ErrorBoundary labelKey="sections.raiseProgress">
                <RaiseTracker target={startup.funding_target} softCircled={analytics.raise.softCircled} committed={analytics.raise.committed} />
              </ErrorBoundary>
            )}
            {startup && <ErrorBoundary labelKey="sections.raiseProgress"><RoundControls startup={startup} /></ErrorBoundary>}
            {startup && analytics.funnel && (
              <ErrorBoundary labelKey="sections.raiseProgress">
                <RaiseFunnel views={analytics.views} saves={analytics.saves} deals={analytics.deals} termSheets={analytics.funnel.termSheets} closed={analytics.funnel.closed} />
              </ErrorBoundary>
            )}
            {benchmarks && benchmarks.entries.length > 0 && (
              /* F10: the strip says what you have; this says whether it is
                 good. Percentiles among same-stage listings that DISCLOSED
                 each metric -- never a ranking, so nobody can reverse-engineer
                 who is one place above them. A hairline band, not another
                 card: copper marks a strong percentile, green stays reserved
                 for money direction. */
              <div style={{ borderTop: "1px solid var(--cr-rule)", borderBottom: "1px solid var(--cr-rule)", padding: "24px 0" }}>
                <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "16px" }}>
                  {t("bench.title", { n: benchmarks.cohortSize })}
                  <InfoTip termKey="bench.explain" />
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "32px" }}>
                  {benchmarks.entries.map(e => (
                    <div key={e.key} style={{ minWidth: "120px" }}>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", fontVariantNumeric: "tabular-nums", color: e.percentile >= 60 ? "var(--cr-copper)" : e.percentile <= 30 ? "var(--cr-ink-3)" : "var(--cr-ink)" }}>
                        p{e.percentile}
                      </p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                        {t(`bench.metric.${e.key}`)} · {t("bench.ofPeers", { n: e.peers })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Flush top={16}><ErrorBoundary labelKey="sections.tractionHistory"><MetricsRecorder /></ErrorBoundary></Flush>
            {/* CapTableCard carries its own 24px bottom margin from the pages
                that use it standalone; Flush hands this stack its rhythm back. */}
            <Flush bottom={24}><CapTableCard /></Flush>
          </div>
        )}

        {/* ── Investor interest: who is looking, and who you are chasing ── */}
        {activeTab === "investors" && (
          <div style={stack24}>
            {/* The opener names what this tab holds, so nothing that moved off
                the overview is lost, and it is what a founder with no activity
                yet reads instead of a blank panel. */}
            <div>
              <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "8px" }}>{t("sections.investorInterest")}</h3>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", lineHeight: 1.65, maxWidth: "60ch" }}>
                {t("dashboard.investorTabNote")}
              </p>
              {/* The panels below are interest: views, saves, questions, a
                  radar. An offer is the one signal that is already an answer
                  waiting on the founder, and it is answered on its own screen,
                  so the tab about who is interested says where that screen
                  is. */}
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", lineHeight: 1.65, maxWidth: "60ch", marginTop: "8px" }}>
                {t("dashboard.offersInboxNote")}
              </p>
              <Link href="/dashboard/startup/offers" style={tertiaryBtn}>
                {t("dashboard.offersInbox")} →
              </Link>
            </div>
            {startup && startup.status === "active" && <ErrorBoundary labelKey="sections.updateComposer"><UpdateComposer /></ErrorBoundary>}
            {startup && <ErrorBoundary labelKey="sections.investorInterest"><QuestionQueue /></ErrorBoundary>}
            <ErrorBoundary labelKey="sections.targetInvestors"><MatchRadar /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.investorInterest"><EngagementPanel /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.investorInterest"><SaversPanel /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.profileViewers"><ViewersPanel /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.targetInvestors"><TargetsPanel /></ErrorBoundary>
          </div>
        )}

        {/* ── Documents: the files, who opened them, and who signed ── */}
        {activeTab === "documents" && (
          <div style={stack24}>
            <div style={panel}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
                <h3 className="ruled-label" data-cr-visible="1">{t("dashboard.uploadedDocuments")}</h3>
                {/* With an empty list, the EmptyState below owns this view's
                    one copper fill; two pills to the same page is noise. */}
                {startup.documents && startup.documents.length > 0 && (
                  <Link href="/dashboard/startup/documents" style={primaryBtn}>
                    {t("dashboard.manage")}
                  </Link>
                )}
              </div>
              {startup.documents && startup.documents.length > 0 ? (
                <div>
                  {/* Rows split by rules; no icon tile repeated down the list. */}
                  {startup.documents.map((doc, i) => (
                    <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "16px 0", borderBottom: i < startup.documents!.length - 1 ? "1px solid var(--cr-rule)" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", minWidth: 0 }}>
                        <div>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)" }}>{doc.label}</p>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "capitalize", marginTop: "4px" }}>{doc.type.replace(/_/g, " ")}</p>
                        </div>
                        {doc.requires_nda && (
                          <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", borderRadius: "3px", padding: "4px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {t("dashboard.ndaRequired")}
                          </span>
                        )}
                      </div>
                      <a href={`/api/documents/open?id=${doc.id}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", minHeight: "40px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none", whiteSpace: "nowrap" }}>
                        {t("dashboard.view")}
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                (() => {
                  const tf = (key: string, fallback: string) => {
                    const out = t(key);
                    return out === key ? fallback : out;
                  };
                  return (
                    <EmptyState
                      title={t("dashboard.noDocuments")}
                      body={tf("dashboard.noDocsBody", "Your deck, financials and data-room files list here, each with how many investors opened it.")}
                      action={
                        <Link href="/dashboard/startup/documents" style={primaryBtn}>
                          {tf("dashboard.uploadFirstDoc", "Upload your first document")}
                        </Link>
                      }
                    />
                  );
                })()
              )}
            </div>
            <ErrorBoundary labelKey="sections.documentAnalytics"><DocAnalyticsPanel /></ErrorBoundary>
            {startup && <ErrorBoundary labelKey="sections.documentAnalytics"><NdaRoster /></ErrorBoundary>}
          </div>
        )}

        {/* ── AI Feedback -- Growth only ── */}
        {activeTab === "ai" && canGrowth && (
          <div style={panel}>
            <div style={{ marginBottom: "24px" }}>
              <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "8px" }}>{t("dashboard.aiPitchFeedback")}</h3>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", lineHeight: 1.65, maxWidth: "60ch" }}>{t("dashboard.aiPitchFeedbackSub")}</p>
            </div>
            {!aiFeedback ? (
              viewingAs ? null : (
                <button onClick={generatePitchFeedback} disabled={loadingFeedback} style={{ ...primaryBtn, opacity: loadingFeedback ? 0.6 : 1 }}>
                  {loadingFeedback ? t("dashboard.analyzing") : t("dashboard.generateFeedback")}
                </button>
              )
            ) : (
              <div>
                {/* The one loud thing on this view -- nothing else here is
                    bigger than 13px, so the score can hold 40. */}
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "24px" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "40px", color: "var(--cr-copper)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{aiFeedback.overall_score}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "16px", color: "var(--cr-ink-4)" }}>/100</span>
                </div>
                {/* Blocks split by rules, not boxes inside the card. */}
                <div style={{ display: "flex", flexDirection: "column", marginBottom: "24px" }}>
                  {[
                    { key: "clarity",                 label: t("dashboard.fbClarity")     },
                    { key: "market_sizing",           label: t("dashboard.fbMarket")      },
                    { key: "competitive_positioning", label: t("dashboard.fbCompetitive") },
                    { key: "missing_information",     label: t("dashboard.fbMissing")     },
                  ].map(({ key, label }) => (
                    <div key={key} style={{ borderTop: "1px solid var(--cr-rule)", padding: "24px 0" }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>{label}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.7, whiteSpace: "pre-wrap", maxWidth: "70ch" }}>{aiFeedback[key]}</p>
                    </div>
                  ))}
                </div>
                {viewingAs ? null : <button onClick={generatePitchFeedback} style={outlineBtn}>{t("dashboard.regenerate")}</button>}
              </div>
            )}
          </div>
        )}

        {/* ── Billing ── */}
        {activeTab === "billing" && (
          <div style={panel}>
            <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "24px" }}>{t("dashboard.subscriptionBilling")}</h3>
            {/* A rule-divided row, not a colored slab -- copper stays for
                emphasis, structure is a hairline. */}
            <div style={{ borderTop: "1px solid var(--cr-rule)", borderBottom: "1px solid var(--cr-rule)", padding: "24px 0", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", textTransform: "capitalize" }}>{t("dashboard.tier", { tier })}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "4px" }}>{profile.subscription_status || t("dashboard.statusActive")}</p>
              </div>
              {viewingAs ? null : (
                <button onClick={openBillingPortal} style={outlineBtn}>
                  {t("dashboard.manageBilling")}
                </button>
              )}
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", lineHeight: 1.7, maxWidth: "70ch" }}>
              {t("dashboard.billingNote")}
            </p>
          </div>
        )}

        {/* F: a founder's best introduction is the investor who passed on
            them politely. Hidden when an admin is viewing as this founder --
            an invite is theirs to send, not ours. 64px marks the seam between
            the tabbed working surface and this standing footer. */}
        {!viewingAs && (
          <div style={{ marginTop: "64px", ...stack24 }}>
            {/* Sharing the round, and finding out whether anybody opened it.
                ShareLinks brings its own 24px top margin from the surfaces it
                is shared with; Flush keeps this seam at exactly 64. */}
            <Flush top={24}><ShareLinks /></Flush>
            <InvitePanel defaultRole="investor" />
          </div>
        )}
      </div>
    </main>
  );
}
