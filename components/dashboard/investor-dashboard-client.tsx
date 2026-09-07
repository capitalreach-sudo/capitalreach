"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { StartupCard } from "@/components/startup/startup-card";
import { notify } from "@/components/ui/toast-notify";
import { Bookmark, Brain, CheckCircle2, CreditCard, Download, Eye, Lock, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { buildAccessContext, investorCan } from "@/lib/access";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { allocationSummary } from "@/lib/round-math";
import type { Profile, Investor, Watchlist, Deal, AiReport } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { InvitePanel } from "@/components/shared/invite-panel";
import { Guilloche } from "@/components/ui/Guilloche";
import { Sparkline } from "@/components/ui/sparkline";
import { EmptyState } from "@/components/ui/EmptyState";
import { WatchlistChanges } from "@/components/investor/watchlist-changes";
import { InfoTip } from "@/components/shared/info-tip";
import { ReadOnlyProvider, useReadOnly } from "@/components/dashboard/read-only";

interface Props {
  profile:    Profile;
  investor:   Investor;
  watchlist:  Watchlist[];
  deals:      Deal[];
  aiReports:  AiReport[];
  /** Set when an admin is viewing this investor's dashboard. See read-only.tsx. */
  viewingAs?: string;
  /** D43: committed and deployed, derived server-side from deals. */
  allocation?: { committed: number; deployed: number };
  /** D40: per-company position, metric curve and latest update. */
  portfolio?: PortfolioPosition[];
  /** Launch mode grants every capability; the server passes the live flag. */
  isLaunchMode?: boolean;
}

export interface PortfolioPosition {
  dealId: string; startupId: string; name: string; slug: string; status: string;
  amount: number | null; currency: string; closedAt: string | null;
  ownershipPercent: number | null; valuationAtClose: number | null; currentValuation: number | null;
  mrr: number | null; mrrSeries: number[]; latestUpdate: { title: string; created_at: string } | null;
}

type InvestorTab = "watchlist" | "portfolio" | "reports" | "billing";

// ── Shared button styles ──────────────────────────────────────────────────────

// Secondary: hairline outline pill, ink text. Primary: the one copper fill
// per view. --cr-band-ink resolves to the light paper tone in both themes,
// which is what "white on copper" means without a hex literal.
const outlineBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "8px",
  border: "1px solid var(--cr-paper-4)", background: "transparent",
  borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: "13px", color: "var(--cr-ink-2)", padding: "8px 16px", cursor: "pointer",
  textDecoration: "none",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "8px",
  background: "var(--cr-copper)", border: "none",
  borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
  fontSize: "13px", color: "var(--cr-band-ink)", padding: "8px 16px", cursor: "pointer",
  textDecoration: "none",
};

// ── Feature access rows ───────────────────────────────────────────────────────

const FEATURE_ROWS = [
  { labelKey: "dashboard.fr1", unlocked: true },
  { labelKey: "dashboard.fr2", unlocked: true },
  { labelKey: "dashboard.fr3", tier: "Angel", key: "financials" },
  { labelKey: "dashboard.fr4", tier: "Angel", key: "financials" },
  { labelKey: "dashboard.fr5", tier: "Angel", key: "msg" },
  { labelKey: "dashboard.fr6", tier: "Angel", key: "msg" },
  { labelKey: "dashboard.fr7", tier: "Pro",   key: "ai" },
  { labelKey: "dashboard.fr8", tier: "Pro",   key: "export" },
  { labelKey: "dashboard.fr9", tier: "Pro",   key: "ai" },
] as const;

// ── Watchlist note ────────────────────────────────────────────────────────────

/**
 * Why a startup was saved, attached to the save.
 *
 * A watchlist of twenty bookmarks with no reasons is a pile, not a shortlist --
 * you end up re-reading profiles to remember what caught your eye. The note
 * column landed in migration 020 and the API accepted it; this is the only way
 * a human can actually write one.
 *
 * Saves on blur rather than behind a button: this is a scratchpad, and asking
 * someone to press Save on a one-line thought is how the field goes unused.
 */
/**
 * D43: allocation for the period -- what you meant to deploy, what is spoken
 * for, and what is left. The target is yours to set; the rest is computed
 * from your deals so it cannot drift out of date.
 */
function AllocationTracker({ investor, committed, deployed }: { investor: Investor; committed: number; deployed: number }) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const inv = investor as unknown as { allocation_target?: number | null; allocation_period?: string | null };
  const [target, setTarget] = useState<number | null>(inv.allocation_target ?? null);
  const [period, setPeriod] = useState(inv.allocation_period ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(inv.allocation_target ?? ""));

  const summary = allocationSummary(target, committed, deployed);
  const cur = (investor as unknown as { currency?: string }).currency || "USD";

  async function save() {
    const n = Number(draft.replace(/[^0-9.]/g, ""));
    const next = draft.trim() === "" ? null : (Number.isFinite(n) ? n : null);
    setEditing(false);
    const res = await fetch("/api/investors/allocation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: next, period: period || null }) });
    if (!res.ok) { notify.error(t("errors.generic")); return; }
    setTarget(next);
  }

  if (summary.target === null && !editing) {
    if (readOnly) return null;
    return (
      <div style={{ background: "var(--cr-paper-2)", border: "1px dashed var(--cr-rule-dark)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: "24px" }}>
        <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)" }}>
          + {t("allocation.set")}
        </button>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11.5px", color: "var(--cr-ink-4)", marginTop: 4 }}>{t("allocation.setHint")}</p>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "var(--radius)", padding: "24px", marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="ruled-label">{t("allocation.title")}<InfoTip termKey="glossary.allocation" /></div>
        {editing ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="decimal" placeholder={t("allocation.targetPh")} autoFocus
              style={{ width: 120, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--cr-ink)", padding: "4px 8px", outline: "none" }} />
            <input value={period} onChange={(e) => setPeriod(e.target.value.slice(0, 40))} placeholder={t("allocation.periodPh")}
              style={{ width: 90, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: 3, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--cr-ink)", padding: "4px 8px", outline: "none" }} />
            <button onClick={save} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: "var(--cr-copper)" }}>{t("common.save")}</button>
          </div>
        ) : (
          <button onClick={() => { setDraft(String(target ?? "")); setEditing(true); }} disabled={readOnly}
            style={{ background: "none", border: "none", padding: 0, cursor: readOnly ? "default" : "pointer", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 14, color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(summary.target ?? 0, cur, { compact: true })}{period ? ` · ${period}` : ""}
          </button>
        )}
      </div>
      {/* Deployed is the solid copper, committed the lighter tint of the same
          hue -- one scale of certainty, not two competing colors. Green stays
          reserved for money direction elsewhere on the page. */}
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--cr-paper-3)" }}>
        <div style={{ width: `${summary.target ? Math.min(100, (deployed / summary.target) * 100) : 0}%`, background: "var(--cr-copper)" }} />
        <div style={{ width: `${summary.target ? Math.min(100, (committed / summary.target) * 100) : 0}%`, background: "color-mix(in srgb, var(--cr-copper) 40%, transparent)" }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: 8, alignItems: "baseline" }}>
        {([
          [t("allocation.deployed"), formatMoney(deployed, cur, { compact: true }), "var(--cr-copper)"],
          [t("allocation.committed"), formatMoney(committed, cur, { compact: true }), "color-mix(in srgb, var(--cr-copper) 40%, transparent)"],
          [t("allocation.remaining"), summary.remaining === null ? "—" : formatMoney(summary.remaining, cur, { compact: true }), "var(--cr-paper-3)"],
        ] as const).map(([label, val, swatch]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "baseline", gap: "6px" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: swatch, alignSelf: "center", flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-2)", fontVariantNumeric: "tabular-nums" }}>{val}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** C31: listings other investors sent you, with the note and the thread. */
/**
 * Who is looking at YOU (migration 107) -- the first inbound-engagement
 * surface investors have ever had. Founders always had viewers/savers panels;
 * an investor profile accumulated nothing. Counts for every plan; names for
 * paid tiers, blurred-teaser upsell otherwise (the founder-side shape).
 */
function WhoViewedYou() {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    views: number; series: number[];
    viewers: Array<{ name: string; kind: "investor" | "founder"; slug: string | null; lastAt: string }>;
    interest: number; conversations: number; locked: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/investors/engagement")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data || (data.views === 0 && data.interest === 0 && data.conversations === 0)) return null;

  // The daily view series arrives with the counts; normalised for the kit
  // sparkline, which draws itself in beside the headline figure. Guarded,
  // since nothing rendered this field before now.
  const series = Array.isArray(data.series) ? data.series : [];
  const seriesMax = Math.max(1, ...series);

  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "var(--radius)", padding: "24px", marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div className="ruled-label">{t("engagement.whoViewedYou")}</div>
        {/* One headline figure (views, copper); the rest support in ink. */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "24px" }}>
          {series.length > 3 && (
            <span aria-hidden style={{ alignSelf: "center" }}>
              <Sparkline points={series.map((v) => v / seriesMax)} width={96} height={20} />
            </span>
          )}
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "24px", color: "var(--cr-copper)", fontVariantNumeric: "tabular-nums" }}>{data.views}</span>{" "}{t("engagement.views30d")}
          </span>
          {data.interest > 0 && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink-2)", fontVariantNumeric: "tabular-nums" }}>{data.interest}</span>{" "}{t("engagement.interestedInYou")}
            </span>
          )}
          {data.conversations > 0 && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink-2)", fontVariantNumeric: "tabular-nums" }}>{data.conversations}</span>{" "}{t("engagement.conversations30d")}
            </span>
          )}
        </div>
      </div>

      {data.locked && data.views > 0 ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }} aria-hidden>
            {Array.from({ length: Math.min(data.views, 3) }).map((_, i) => (
              <div key={i} style={{ height: "14px", width: `${55 + i * 12}%`, background: "var(--cr-paper-4)", borderRadius: "3px" }} />
            ))}
          </div>
          <Link href="/pricing" style={{ display: "block", textAlign: "center", marginTop: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
            {t("dashboard.upgradeSeeWho")} →
          </Link>
        </>
      ) : data.viewers.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {data.viewers.slice(0, 8).map((v, i) => (
            <div key={`${v.slug}-${i}`} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
              {v.slug ? (
                <Link href={v.kind === "investor" ? `/investors/${v.slug}` : `/startups/${v.slug}`}
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", textDecoration: "none" }}>
                  {v.name}
                </Link>
              ) : (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)" }}>{v.name}</span>
              )}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                {v.lastAt ? new Date(v.lastAt).toLocaleDateString() : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SharedWithYou() {
  const { t } = useTranslation();
  type Share = { id: string; note: string | null; created_at: string; thread_id: string | null; startup: { name: string; slug: string } | null; from_investor?: { slug: string; display_name: string | null; firm_name: string | null } | null };
  const [received, setReceived] = useState<Share[]>([]);
  useEffect(() => {
    fetch("/api/deals/share").then(r => r.ok ? r.json() : null).then(j => setReceived(j?.received ?? [])).catch(() => {});
  }, []);
  if (received.length === 0) return null;
  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "var(--radius)", padding: "24px", marginBottom: "24px" }}>
      <div className="ruled-label" style={{ marginBottom: "4px" }}>{t("coInvestors.sharedTitle", { count: received.length })}</div>
      {/* Inside a card, structure is rules: shares separate with hairlines,
          not boxes-in-boxes. */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {received.map((sh, i) => (
          <div key={sh.id} style={{ padding: "12px 0", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <Link href={`/startups/${sh.startup?.slug ?? ""}`} style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "14px", color: "var(--cr-ink)", textDecoration: "none" }}>
                {sh.startup?.name ?? "—"}
              </Link>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)" }}>{formatDate(sh.created_at)}</span>
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11.5px", color: "var(--cr-ink-4)", marginTop: 2 }}>
              {t("coInvestors.sharedBy")}{" "}
              {sh.from_investor ? <Link href={`/investors/${sh.from_investor.slug}`} style={{ color: "var(--cr-copper)", textDecoration: "none" }}>{sh.from_investor.display_name || sh.from_investor.firm_name || t("deals.investorFallback")}</Link> : t("deals.investorFallback")}
            </p>
            {sh.note && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px", color: "var(--cr-ink-2)", marginTop: 6, lineHeight: 1.5 }}>“{sh.note}”</p>}
            {sh.thread_id && (
              <Link href={`/dashboard/messages?thread=${sh.thread_id}`} style={{ display: "inline-block", marginTop: 6, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11.5px", color: "var(--cr-copper)", textDecoration: "none" }}>
                {t("coInvestors.continueThread")} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * C26: the watchlist is a pipeline, not a pile. Status moves a save through
 * triage; priority stars it. Both persist through PATCH /api/watchlist.
 */
const WL_STATUSES = ["watching", "reviewing", "contacted", "passed"] as const;
type WlStatus = typeof WL_STATUSES[number];
const WL_KEY: Record<WlStatus, string> = {
  watching: "watchlist.stWatching", reviewing: "watchlist.stReviewing",
  contacted: "watchlist.stContacted", passed: "watchlist.stPassed",
};
// Green/red are reserved for money direction, so triage states speak in the
// house accents instead: copper = in motion, verdigris = success/contacted,
// ink shades for the resting states (a passed card also dims to 0.6).
const WL_COLOR: Record<WlStatus, string> = {
  watching: "var(--cr-ink-4)", reviewing: "var(--cr-copper)",
  contacted: "var(--verdigris)", passed: "var(--cr-ink-3)",
};

function WatchlistTriage({ startupId, status, priority, onChange }: { startupId: string; status: WlStatus; priority: number; onChange: (patch: { status?: WlStatus; priority?: number }) => void }) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const [busy, setBusy] = useState(false);

  async function patch(body: { status?: WlStatus; priority?: number }) {
    if (readOnly || busy) return;
    const prev = { status, priority };
    onChange(body);                       // optimistic
    setBusy(true);
    const res = await fetch("/api/watchlist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId, ...body }) });
    setBusy(false);
    if (!res.ok) { onChange(prev); notify.error(t("errors.generic")); }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
      <select value={status} onChange={(e) => patch({ status: e.target.value as WlStatus })} disabled={readOnly}
        aria-label={t("watchlist.statusLabel")}
        style={{ background: "var(--cr-paper-2)", border: `1px solid ${WL_COLOR[status]}`, color: WL_COLOR[status], borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", padding: "3px 6px", textTransform: "uppercase", letterSpacing: "0.05em", cursor: readOnly ? "default" : "pointer", outline: "none" }}>
        {WL_STATUSES.map((s) => <option key={s} value={s}>{t(WL_KEY[s])}</option>)}
      </select>
      {/* Priority: three dots, click to set, click the current one to clear. */}
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: "4px" }}>{t("watchlist.priorityLabel")}</span>
      <div style={{ display: "inline-flex", gap: "3px", alignItems: "center" }} role="group" aria-label={t("watchlist.priorityLabel")}>
        {[1, 2, 3].map((n) => (
          <button key={n} onClick={() => patch({ priority: priority === n ? 0 : n })} disabled={readOnly}
            aria-label={`${t("watchlist.priorityLabel")} ${n}`} aria-pressed={priority >= n}
            style={{ width: 9, height: 9, borderRadius: "50%", padding: 0, cursor: readOnly ? "default" : "pointer", border: `1px solid ${priority >= n ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`, background: priority >= n ? "var(--cr-copper)" : "transparent" }} />
        ))}
      </div>
    </div>
  );
}

function WatchlistNote({ startupId, initial }: { startupId: string; initial: string | null }) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const [value, setValue]     = useState(initial ?? "");
  const [saved, setSaved]     = useState(initial ?? "");
  const [busy, setBusy]       = useState(false);
  const [editing, setEditing] = useState(false);

  async function persist() {
    if (readOnly) { setEditing(false); return; }
    const next = value.trim();
    setEditing(false);
    if (next === saved) return;          // nothing changed -- don't write
    setBusy(true);
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId, note: next || null }),
    });
    setBusy(false);
    if (!res.ok) { notify.error(t("dashboard.noteSaveFailed")); setValue(saved); return; }
    setSaved(next);
  }

  if (!editing && !saved) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{ background: "none", border: "none", padding: "6px 2px 0", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-copper)", textDecoration: "underline" }}
      >
        + {t("dashboard.addNote")}
      </button>
    );
  }

  if (!editing) {
    return (
      <p
        onClick={() => setEditing(true)}
        title={t("dashboard.editNote")}
        style={{ margin: "6px 2px 0", cursor: "text", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", lineHeight: 1.5, color: "var(--cr-ink-3)", whiteSpace: "pre-wrap" }}
      >
        {saved}
      </p>
    );
  }

  return (
    <textarea
      autoFocus
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={persist}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setValue(saved); setEditing(false); }
        // Enter commits; Shift+Enter keeps the newline, since these run to a
        // couple of lines often enough to be worth allowing.
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
      }}
      maxLength={1000}
      rows={2}
      placeholder={t("dashboard.notePlaceholder")}
      style={{ width: "100%", marginTop: "6px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "6px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink)", outline: "none", resize: "vertical", boxSizing: "border-box" }}
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The last listings this investor opened, straight from their own
 * startup_views history (RLS returns only the caller's rows). Deal-flow
 * triage starts where it left off instead of from a cold directory.
 */
function RecentlyViewedStrip() {
  const { t } = useTranslation();
  const supabase = useRef(createClient()).current;
  const [rows, setRows] = useState<Array<{ slug: string; name: string; viewedAt: string }>>([]);

  useEffect(() => {
    supabase.from("startup_views")
      .select("viewed_at, startup:startups(slug, name, status)")
      .order("viewed_at", { ascending: false })
      .limit(30)
      .then(({ data }: { data: any[] | null }) => {
        const seen = new Map<string, { slug: string; name: string; viewedAt: string }>();
        for (const r of (data ?? []) as any[]) {
          const s = r.startup;
          if (!s?.slug || s.status !== "active" || seen.has(s.slug)) continue;
          seen.set(s.slug, { slug: s.slug, name: s.name, viewedAt: r.viewed_at });
        }
        setRows(Array.from(seen.values()).slice(0, 6));
      });
  }, [supabase]);

  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: "24px" }}>
      <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("dashboard.jumpBackIn")}</div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {rows.map((r) => (
          <Link key={r.slug} href={`/startups/${r.slug}`}
            style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "13px", color: "var(--cr-ink)", background: "transparent", border: "1px solid var(--cr-paper-4)", borderRadius: "3px", padding: "8px 12px", textDecoration: "none" }}>
            {r.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * The saved searches themselves, finally manageable: name, a one-line filter
 * summary, open (the URL-synced browse makes every search addressable), and
 * delete. The daily cron keeps matching either way.
 */
function SavedSearchManager() {
  const readOnly = useReadOnly();
  const { t } = useTranslation();
  const [rows, setRows] = useState<Array<{ id: string; name: string; filters: Record<string, unknown> }> | null>(null);

  useEffect(() => {
    fetch("/api/saved-searches").then(r => r.ok ? r.json() : null).then(j => setRows(j?.searches ?? null)).catch(() => setRows(null));
  }, []);

  if (!rows || rows.length === 0) return null;

  const toQuery = (f: Record<string, unknown>) => {
    const p = new URLSearchParams();
    if (f.query)      p.set("q", String(f.query));
    if (Array.isArray(f.industries) && f.industries.length) p.set("industries", f.industries.join(","));
    if (Array.isArray(f.stages) && f.stages.length)         p.set("stages", f.stages.join(","));
    if (Number(f.mrrMin) > 0)     p.set("mrr", String(f.mrrMin));
    if (Number(f.aiScoreMin) > 0) p.set("score", String(f.aiScoreMin));
    if (f.country)                p.set("country", String(f.country));
    return p.toString();
  };
  const summary = (f: Record<string, unknown>) => [
    ...(Array.isArray(f.industries) ? f.industries : []),
    ...(Array.isArray(f.stages) ? f.stages : []),
    Number(f.mrrMin) > 0 ? `MRR $${Number(f.mrrMin)/1000}k+` : null,
    Number(f.aiScoreMin) > 0 ? `Score ${f.aiScoreMin}+` : null,
    f.country || null, f.query ? `"${f.query}"` : null,
  ].filter(Boolean).join(" · ") || "—";

  async function remove(id: string) {
    if (readOnly) return;
    const prevRows = rows;
    setRows(prev => prev?.filter(r => r.id !== id) ?? prev);
    const res = await fetch("/api/saved-searches", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    if (!res?.ok) { setRows(prevRows); notify.error(t("errors.generic")); }
  }

  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "var(--radius)", padding: "24px", marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
        <div className="ruled-label">{t("dashboard.savedSearches")}</div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-4)", fontVariantNumeric: "tabular-nums" }}>{rows.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
            <div style={{ minWidth: 0 }}>
              <Link href={`/startups?${toQuery(r.filters)}`}
                style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", textDecoration: "none" }}>
                {r.name}
              </Link>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary(r.filters)}</p>
            </div>
            <button onClick={() => remove(r.id)} aria-label={`delete ${r.name}`}
              style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", fontSize: "14px", lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InvestorDashboardClient({ profile, investor, watchlist, deals, aiReports, viewingAs, allocation, portfolio = [], isLaunchMode = false }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { t }        = useTranslation();
  const [activeTab, setActiveTab] = useState<InvestorTab>("watchlist");
  // C26: local triage state so status/priority edits are instant.
  const [wlState, setWlState] = useState<Record<string, { status: WlStatus; priority: number }>>(() =>
    Object.fromEntries(watchlist.map((w) => [w.id, { status: (w.status ?? "watching") as WlStatus, priority: w.priority ?? 0 }])),
  );
  const [wlFilter, setWlFilter] = useState<"all" | WlStatus>("all");
  // C36: reports were capped at 10 and inert. Full list, delete, export,
  // and a link to the deal they belong to.
  const [reports, setReports] = useState<Array<{ id: string; type: string; content: string; created_at: string; startup?: { name: string; slug: string } | null; dealId?: string | null }>>(aiReports as never[]);
  useEffect(() => {
    fetch("/api/ai/reports").then(r => r.ok ? r.json() : null).then(j => { if (j?.reports) setReports(j.reports); }).catch(() => {});
  }, []);
  async function deleteReport(id: string) {
    if (!window.confirm(t("dashboard.reportDeleteConfirm"))) return;
    const res = await fetch("/api/ai/reports", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) { notify.error(t("errors.generic")); return; }
    setReports(prev => prev.filter(r => r.id !== id));
  }
  function exportReport(r: { content: string; created_at: string; startup?: { name: string } | null; type: string }) {
    const md = `# ${r.startup?.name ?? "Report"} — ${r.type.replace(/_/g, " ")}\n\n_${new Date(r.created_at).toLocaleString()}_\n\n${r.content}\n\n---\nAI-generated for informational purposes only. Not investment advice.\n`;
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `${(r.startup?.name ?? "report").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${r.type}.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  const TABS: { value: InvestorTab; label: string; Icon: React.ElementType }[] = [
    { value: "watchlist", label: t("dashboard.watchlist"), Icon: Bookmark   },
    { value: "portfolio", label: t("dashboard.portfolio"), Icon: TrendingUp },
    { value: "reports",   label: t("dashboard.aiReports"), Icon: Brain      },
    { value: "billing",   label: t("dashboard.billing"),   Icon: CreditCard },
  ];

  useEffect(() => {
    if (searchParams.get("billing") === "soon") {
      notify.info(t("dashboard.billingSoon"));
    } else if (searchParams.get("upgraded") === "1") {
      notify.success(t("dashboard.upgradedToast"));
    }
    if (searchParams.get("upgraded") || searchParams.get("billing")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("upgraded");
      url.searchParams.delete("free");
      url.searchParams.delete("billing");
      url.searchParams.delete("welcome");
      router.replace(url.pathname + (url.search || ""));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One capability object instead of four legacy tier-string checks; admin
  // and suspension handling come along for free. Launch mode is a server
  // concern and is already reflected in subscription_tier upgrades.
  // isLaunchMode was hardcoded false here, so during launch the client
  // gated features the server had granted. The server passes the live flag.
  const caps             = investorCan(buildAccessContext(profile, isLaunchMode));
  const canExport        = caps.dataExport;
  const canSeeFinancials = caps.viewFinancials;
  const canMsg           = caps.message;
  const canAi            = caps.aiDiligence !== "no";

  const tierLabel = investor.subscription_tier === "free"
    ? "Explorer"
    : investor.subscription_tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  async function exportWatchlist() {
    if (!watchlist.length) return;
    const rows = watchlist.map((w) => ({
      status: wlState[w.id]?.status ?? "watching",
      priority: wlState[w.id]?.priority ?? 0,
      name: w.startup?.name, tagline: w.startup?.tagline,
      industry: w.startup?.industry, stage: w.startup?.stage,
      funding_target: w.startup?.funding_target, mrr: w.startup?.mrr,
    }));
    const csv = [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "capitalreach-watchlist.csv"; a.click();
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

  const activeDeals = deals.filter((d) => !["closed", "passed"].includes(d.status)).length;
  const closedDeals = deals.filter((d) => d.status === "closed").length;

  function isUnlocked(key?: string) {
    if (!key) return true;
    if (key === "financials" || key === "msg") return canSeeFinancials;
    if (key === "ai") return canAi;
    if (key === "export") return canExport;
    return false;
  }

  return (
    <ReadOnlyProvider value={!!viewingAs}>
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>

      {/* Same banner as the founder view. Every write path below -- including
          the ones inside WatchlistNote and SavedSearchManager -- is gated on
          the ReadOnly context, because those post to APIs that authenticate as
          the *admin*: an ungated click would write to the admin's own
          watchlist while appearing to act on this investor's. */}
      {viewingAs && (
        <div
          role="status"
          style={{
            background: "var(--cr-ink)", color: "var(--cr-paper)",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "12px", flexWrap: "wrap", padding: "10px 20px",
            fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
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
        {/* Banknote texture, barely there -- same touch as the founder header,
            so both sides of the marketplace open on the same note. */}
        <div aria-hidden style={{ position: "absolute", top: "-140px", right: "-100px", width: "460px", height: "460px", color: "var(--cr-ink)", pointerEvents: "none" }}>
          <Guilloche opacity={0.05} />
        </div>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 32px 32px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", position: "relative" }}>
          <div>
            <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("dashboard.investorDashboard")}</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 36px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "12px" }}>
              {profile.full_name || t("dashboard.yourPortfolio")}
            </h1>
            {/* One diamond -- the house glyph -- marks the membership line,
                the same rhythm as the founder header's badge row. */}
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "11px" }}>✦</span>
              {t("dashboard.membership", { tier: tierLabel })}
            </p>
          </div>
          {/* Hidden in view-as: these navigate the ADMIN's own surfaces and
              silently leave the impersonation -- the banner owns the exit. */}
          {!viewingAs && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href="/dashboard/messages" style={outlineBtn}>{t("dashboard.messages")}</Link>
            <Link href="/dashboard/team" style={outlineBtn}>{t("team.navLabel")}</Link>
            <Link href="/dashboard/investor/settings" style={outlineBtn}>{t("dashboard.settings")}</Link>
          </div>}
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 32px 64px" }}>

        {/* Thesis completeness -- the fields that drive matching. Shown only
            while something is missing; each gap links straight to Settings. */}
        {(() => {
          const gaps: string[] = [];
          if (!investor.investment_thesis) gaps.push(t("dashboard.thesisGapThesis"));
          if (!investor.stages?.length) gaps.push(t("dashboard.thesisGapStages"));
          if (!investor.industries?.length) gaps.push(t("dashboard.thesisGapIndustries"));
          if (!investor.geography?.length) gaps.push(t("dashboard.thesisGapGeo"));
          if (!investor.min_check && !investor.max_check) gaps.push(t("dashboard.thesisGapCheck"));
          const total = 5, done = total - gaps.length, pct = Math.round((done / total) * 100);
          if (gaps.length === 0) return null;
          return (
            <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "var(--radius)", padding: "16px 24px", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{t("dashboard.thesisBannerTitle")}</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", marginTop: "2px" }}>{t("dashboard.thesisBannerBody")}</p>
                </div>
                {/* Tertiary, not a second copper pill: the tinted banner
                    already carries the emphasis, and the one primary action
                    per view lives further down the page. */}
                <Link href="/dashboard/investor/settings" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none", whiteSpace: "nowrap" }}>{t("dashboard.completeProfile")} →</Link>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" }}>
                <div style={{ flex: 1, height: "4px", background: "color-mix(in srgb, var(--cr-copper) 15%, transparent)", borderRadius: "2px", overflow: "hidden" }}>
                  <div className="animate-draw-bar" style={{ ["--bar-width" as string]: `${pct}%`, width: `${pct}%`, height: "100%", background: "var(--cr-copper)" }} />
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-copper)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11.5px", color: "var(--cr-ink-3)", marginTop: "8px" }}>
                {t("dashboard.thesisMissing")}: {gaps.join(" · ")}
              </p>
            </div>
          );
        })()}

        {/* Instrument strip: one hairline-divided row instead of four boxed
            cards. The watchlist count is the headline figure; the rest sit a
            size down; closed deals take verdigris once anything has matured. */}
        <div style={{ borderTop: "1px solid var(--cr-rule-dark)", borderBottom: "1px solid var(--cr-rule-dark)", overflow: "hidden", marginBottom: "48px" }}>
          {/* The deal counts were plain divs, so the two most important numbers
              on an investor's home screen -- how many deals are live, how many
              closed -- led nowhere, and the Deal Portal was reachable only
              through the top nav. They link now; the other two stay inert
              because their content is on this page already. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginLeft: "-1px" }}>
            {[
              { label: t("dashboard.watchlist"),   val: watchlist.length,  href: null,     headline: true,  color: "var(--cr-ink)" },
              { label: t("dashboard.activeDeals"), val: activeDeals,       href: "/deals", headline: false, color: "var(--cr-ink-2)" },
              { label: t("dashboard.closedDeals"), val: closedDeals,       href: "/deals", headline: false, color: closedDeals > 0 ? "var(--verdigris)" : "var(--cr-ink-2)" },
              { label: t("dashboard.aiReports"),   val: reports.length,    href: null,     headline: false, color: "var(--cr-ink-2)" },
            ].map(({ label, val, href, headline, color }) => {
              const cell = (
                <div style={{ borderLeft: "1px solid var(--cr-rule)", padding: "24px", height: "100%" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
                    {label}{href && <span aria-hidden style={{ color: "var(--cr-copper)", marginLeft: "6px" }}>→</span>}
                  </p>
                  {/* Same scale as the founder strip: 40px headline, the rest
                      a size down at 500 -- one obvious number per strip. */}
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: headline ? 700 : 500, fontSize: headline ? "40px" : "22px", lineHeight: 1.05, color, fontVariantNumeric: "tabular-nums" }}>{val}</p>
                </div>
              );
              return href
                ? <Link key={label} href={href} style={{ textDecoration: "none", display: "block" }}>{cell}</Link>
                : <div key={label}>{cell}</div>;
            })}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: "32px", display: "flex", gap: 0, overflowX: "auto" }}>
          {TABS.map(({ value, label }) => (
            <button key={value} onClick={() => setActiveTab(value)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", fontWeight: activeTab === value ? 600 : 300,
                fontSize: "13px", color: activeTab === value ? "var(--cr-ink)" : "var(--cr-ink-4)",
                padding: "10px 18px 9px", whiteSpace: "nowrap",
                borderBottom: activeTab === value ? "2px solid var(--cr-copper)" : "2px solid transparent",
                transition: "color 100ms ease, border-color 100ms ease",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Watchlist ── */}
        {activeTab === "watchlist" && (
          <div>
            {!viewingAs && <ErrorBoundary labelKey="sections.profileViewers"><WhoViewedYou /></ErrorBoundary>}
            {/* What moved on the companies already saved, above the list of
                them: the list says what you picked, this says what happened. */}
            <ErrorBoundary labelKey="sections.recentlyViewed"><WatchlistChanges /></ErrorBoundary>
            {/* Fetches the CALLER's own view history -- in view-as that is the
                admin's trail, not the member's. Hidden rather than wrong. */}
            {!viewingAs && <ErrorBoundary labelKey="sections.recentlyViewed"><RecentlyViewedStrip /></ErrorBoundary>}
            {allocation && caps.allocationTracking && <ErrorBoundary labelKey="sections.savedSearches"><AllocationTracker investor={investor} committed={allocation.committed} deployed={allocation.deployed} /></ErrorBoundary>}
            <ErrorBoundary labelKey="sections.savedSearches"><SharedWithYou /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.savedSearches"><SavedSearchManager /></ErrorBoundary>
            {/* The saved list is its own section, so it opens the house way:
                ruled label, quiet count beside it, the one control at right. */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "32px 0 16px", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
                <div className="ruled-label">{t("dashboard.watchlist")}</div>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
                  {watchlist.length === 1 ? t("dashboard.savedCountOne") : t("dashboard.savedCount", { count: watchlist.length })}
                </span>
              </div>
              {canExport && watchlist.length > 0 && (
                <button onClick={exportWatchlist} style={outlineBtn}>
                  <Download style={{ width: 12, height: 12 }} /> {t("dashboard.exportCsv")}
                </button>
              )}
            </div>
            {/* Triage filter -- counts come from live local state. */}
            {watchlist.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                {(["all", ...WL_STATUSES] as const).map((f) => {
                  const n = f === "all" ? watchlist.length : watchlist.filter((w) => (wlState[w.id]?.status ?? "watching") === f).length;
                  const active = wlFilter === f;
                  return (
                    <button key={f} onClick={() => setWlFilter(f)} aria-pressed={active}
                      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", padding: "5px 12px", borderRadius: "999px", cursor: "pointer",
                        background: active ? "var(--cr-copper-bg)" : "transparent", color: active ? "var(--cr-copper)" : "var(--cr-ink-3)",
                        border: `1px solid ${active ? "var(--cr-copper-br)" : "var(--cr-paper-4)"}` }}>
                      {f === "all" ? t("dashboard.filterAll") : t(WL_KEY[f])}{" "}
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "10px", fontVariantNumeric: "tabular-nums" }}>{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {watchlist.length === 0 ? (
              <EmptyState
                title={t("dashboard.noSavedYet")}
                body={t("dashboard.noSavedYetSub")}
                action={<Link href="/startups" style={primaryBtn}>{t("dashboard.browseStartups")} →</Link>}
              />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
                {watchlist
                  .filter((w) => wlFilter === "all" || (wlState[w.id]?.status ?? "watching") === wlFilter)
                  .map((w) => w.startup && (
                  <div key={w.id} style={{ opacity: (wlState[w.id]?.status ?? "watching") === "passed" ? 0.6 : 1 }}>
                    <StartupCard startup={w.startup} investorTier={investor.subscription_tier} />
                    <WatchlistTriage
                      startupId={w.startup.id}
                      status={wlState[w.id]?.status ?? "watching"}
                      priority={wlState[w.id]?.priority ?? 0}
                      onChange={(patch) => setWlState((p) => ({ ...p, [w.id]: { ...(p[w.id] ?? { status: "watching", priority: 0 }), ...patch } }))}
                    />
                    <WatchlistNote startupId={w.startup.id} initial={w.note ?? null} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AI Reports ── */}
        {activeTab === "portfolio" && !caps.portfolio && (
          <EmptyState
            title={t("dashboard.portfolioUpgrade")}
            action={<Link href="/pricing" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>{t("dashboard.viewPlans")} →</Link>}
          />
        )}
        {activeTab === "portfolio" && caps.portfolio && (() => {
          const positions = portfolio;
          const total = positions.reduce((a, p) => a + (p.amount ?? 0), 0);
          const cur = positions[0]?.currency ?? "USD";
          // D40: a position is worth what it grew into, not just what it cost.
          const markUp = (p: PortfolioPosition) =>
            p.valuationAtClose && p.currentValuation && p.valuationAtClose > 0
              ? (p.currentValuation / p.valuationAtClose - 1) * 100
              : null;

          return positions.length === 0 ? (
            <EmptyState
              title={t("dashboard.noPortfolio")}
              body={t("dashboard.noPortfolioSub")}
            />
          ) : (
            <div>
              {/* Section opener + the one headline figure of this tab. */}
              <div style={{ marginBottom: "32px" }}>
                <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("dashboard.totalDeployed")}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "36px", lineHeight: 1.05, color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums" }}>{formatMoney(total, cur)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-4)", fontVariantNumeric: "tabular-nums" }}>· {positions.length}</span>
                </div>
              </div>

              <div style={{ display: "grid", gap: "16px" }}>
                {positions.map((p) => {
                  const mu = markUp(p);
                  const series = p.mrrSeries;
                  const max = Math.max(1, ...series);
                  return (
                    <div key={p.dealId} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "var(--radius)", padding: "24px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                          <Link href={`/startups/${p.slug}`} style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "16px", color: "var(--cr-ink)", textDecoration: "none" }}>
                            {p.name}
                          </Link>
                          {/* D41: a company that archived its listing is still
                              yours -- say so instead of letting it disappear. */}
                          {p.status !== "active" && (
                            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cr-ink-4)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", padding: "1px 6px" }}>
                              {t("portfolio.notListed")}
                            </span>
                          )}
                        </div>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums" }}>
                          {p.amount != null ? formatMoney(p.amount, p.currency) : "—"}
                        </span>
                      </div>

                      {/* Hairline-divided metric strip; only the mark change
                          keeps money-direction color. */}
                      <div style={{ overflow: "hidden", marginTop: "16px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", marginLeft: "-1px" }}>
                          {[
                            [t("portfolio.ownership"), p.ownershipPercent != null ? `${p.ownershipPercent.toFixed(2)}%` : "—"],
                            [t("portfolio.atClose"), p.valuationAtClose ? formatMoney(p.valuationAtClose, p.currency, { compact: true }) : "—"],
                            [t("portfolio.nowValued"), p.currentValuation ? formatMoney(p.currentValuation, p.currency, { compact: true }) : "—"],
                            [t("portfolio.markChange"), mu == null ? "—" : `${mu > 0 ? "+" : ""}${mu.toFixed(0)}%`],
                            [t("startupDetail.mrr"), p.mrr != null ? formatMoney(p.mrr, p.currency, { compact: true }) : "—"],
                          ].map(([label, value]) => (
                            <div key={label} style={{ borderLeft: "1px solid var(--cr-rule)", padding: "4px 12px" }}>
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", fontVariantNumeric: "tabular-nums", color: label === t("portfolio.markChange") && mu != null ? (mu >= 0 ? "var(--cr-up)" : "var(--cr-down)") : "var(--cr-ink)" }}>{value}</div>
                              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: "2px" }}>{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Metric curve -- the reason a position is worth watching.
                          The kit sparkline draws itself in; fixed pixel box, no
                          %-height against a flex parent. */}
                      {series.length > 3 && (
                        <div style={{ marginTop: "12px" }}>
                          <Sparkline points={series.map((v) => v / max)} width={140} height={24} />
                        </div>
                      )}

                      {/* D42: the founder's latest word reaches the people who funded it. */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--cr-rule)", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11.5px", color: "var(--cr-ink-3)" }}>
                          {p.latestUpdate
                            ? <>{t("portfolio.latestUpdate")}: <span style={{ color: "var(--cr-ink)", fontWeight: 500 }}>{p.latestUpdate.title}</span> · {formatDate(p.latestUpdate.created_at)}</>
                            : t("portfolio.noUpdates")}
                        </span>
                        <Link href={`/deals?deal=${p.dealId}`} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11.5px", color: "var(--cr-copper)", textDecoration: "none" }}>
                          {t("dashboard.reportViewDeal")} →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {activeTab === "reports" && (
          reports.length === 0 ? (
            <EmptyState
              title={t("dashboard.noAiReportsTitle")}
              body={canAi
                ? t("dashboard.aiReportsHintPro")
                : t("dashboard.aiReportsHintUpgrade")}
              action={!canAi ? <Link href="/pricing" style={primaryBtn}>{t("dashboard.viewPlans")}</Link> : undefined}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {reports.map((report) => (
                <div key={report.id} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "var(--radius)", padding: "24px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)" }}>
                        {report.startup?.name}
                      </span>
                      <span style={{ background: "transparent", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {report.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", fontVariantNumeric: "tabular-nums" }}>
                      {formatDate(report.created_at)}
                    </span>
                  </div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.65, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {report.content}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--cr-rule)", flexWrap: "wrap" }}>
                    <Link href={`/startups/${report.startup?.slug}`}
                      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                      {t("dashboard.viewStartup")} →
                    </Link>
                    {report.dealId && (
                      <Link href={`/deals?deal=${report.dealId}`}
                        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                        {t("dashboard.reportViewDeal")} →
                      </Link>
                    )}
                    <button onClick={() => exportReport(report)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-3)" }}>
                      {t("dashboard.reportExport")}
                    </button>
                    {/* Quiet destructive action: red stays reserved for money
                        direction; the confirm dialog carries the weight. */}
                    <button onClick={() => deleteReport(report.id)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-4)" }}>
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Billing ── */}
        {activeTab === "billing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* No card around cards: the plan slab is the one tinted moment,
                everything after it hangs off hairlines. */}
            <div>
              <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("dashboard.membershipBilling")}</div>

              {/* Current plan row */}
              <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "var(--radius)", padding: "16px 24px", marginBottom: "32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>{t("dashboard.tier", { tier: tierLabel })}</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>
                    {profile.subscription_status || t("dashboard.statusActive")}
                  </p>
                </div>
                {investor.subscription_tier !== "free" ? (
                  <button onClick={openBillingPortal} style={outlineBtn}>
                    <CreditCard style={{ width: 13, height: 13 }} /> {t("dashboard.manageBilling")}
                  </button>
                ) : (
                  <Link href="/pricing" style={primaryBtn}>{t("dashboard.upgradePlan")}</Link>
                )}
              </div>

              {/* Feature list */}
              <div>
                <div className="ruled-label" style={{ marginBottom: "8px" }}>{t("dashboard.accessLevel")}</div>
                {/* Ledger lines: one hairline per capability row. */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {FEATURE_ROWS.map((item, i) => {
                    const unlocked = "unlocked" in item ? item.unlocked : isUnlocked(item.key);
                    return (
                      <div key={item.labelKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {/* Verdigris is the success accent; green stays for
                              money direction. */}
                          {unlocked
                            ? <CheckCircle2 style={{ width: 14, height: 14, color: "var(--verdigris)", flexShrink: 0 }} />
                            : <Lock style={{ width: 14, height: 14, color: "var(--cr-ink-4)", flexShrink: 0 }} />}
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: unlocked ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>
                            {t(item.labelKey)}
                          </span>
                        </div>
                        {!unlocked && "tier" in item && (
                          <span style={{ background: "transparent", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px", whiteSpace: "nowrap" }}>
                            {item.tier}+
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* The pitch rides a hairline, not a second tinted box; the
                    plan slab above already holds this view's primary pill,
                    so the way to the full grid is a tertiary link. */}
                {investor.subscription_tier === "free" && (
                  <div style={{ marginTop: "32px", borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "24px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "6px" }}>
                      {t("dashboard.upgradeAngel")}
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", marginBottom: "12px" }}>
                      {t("dashboard.upgradeAngelSub")}
                    </p>
                    <Link href="/pricing" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>{t("dashboard.viewAllPlans")} →</Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {!viewingAs && (
          <div style={{ marginTop: "32px" }}>
            <InvitePanel defaultRole="startup" />
          </div>
        )}
      </div>

      {/* A second, dashboard-local bottom tab bar used to live here. It carried
          an inline display:none alongside its sm:hidden class, so the inline
          rule always won and it never rendered once -- the tab strip above,
          which scrolls horizontally, has always been the real control on
          every width. The global mobile tab bar (components/shared/bottom-nav)
          now owns the bottom of the viewport, so a second one would collide
          even if it were fixed. */}
    </main>
    </ReadOnlyProvider>
  );
}
