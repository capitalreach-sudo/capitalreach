"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { StartupCard } from "@/components/startup/startup-card";
import { notify } from "@/components/ui/toast-notify";
import { Bookmark, Brain, CheckCircle2, CreditCard, Download, Eye, Lock, MessageSquare, Search, Settings, TrendingUp, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { buildAccessContext, investorCan } from "@/lib/access";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import type { Profile, Investor, Watchlist, Deal, AiReport } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { ReadOnlyProvider, useReadOnly } from "@/components/dashboard/read-only";

interface Props {
  profile:    Profile;
  investor:   Investor;
  watchlist:  Watchlist[];
  deals:      Deal[];
  aiReports:  AiReport[];
  /** Set when an admin is viewing this investor's dashboard. See read-only.tsx. */
  viewingAs?: string;
}

type InvestorTab = "watchlist" | "portfolio" | "reports" | "billing";

// ── Shared button styles ──────────────────────────────────────────────────────

const outlineBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)",
  borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
  fontSize: "13px", color: "var(--cr-ink-3)", padding: "7px 14px", cursor: "pointer",
  textDecoration: "none",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  background: "var(--cr-copper)", border: "none",
  borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
  fontSize: "13px", color: "#fff", padding: "8px 18px", cursor: "pointer",
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
    <div style={{ marginBottom: "20px" }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
        <Eye style={{ width: 11, height: 11 }} /> {t("dashboard.jumpBackIn")}
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {rows.map((r) => (
          <Link key={r.slug} href={`/startups/${r.slug}`}
            style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "13px", color: "var(--cr-ink)", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", padding: "6px 12px", textDecoration: "none" }}>
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
    setRows(prev => prev?.filter(r => r.id !== id) ?? prev);
    await fetch("/api/saved-searches", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <Search style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("dashboard.savedSearches")}</h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--cr-ink-4)" }}>{rows.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
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

export function InvestorDashboardClient({ profile, investor, watchlist, deals, aiReports, viewingAs }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { t }        = useTranslation();
  const [activeTab, setActiveTab] = useState<InvestorTab>("watchlist");

  const TABS: { value: InvestorTab; label: string; Icon: React.ElementType }[] = [
    { value: "watchlist", label: t("dashboard.watchlist"), Icon: Bookmark   },
    { value: "portfolio", label: t("dashboard.portfolio"), Icon: TrendingUp },
    { value: "reports",   label: t("dashboard.aiReports"), Icon: Brain      },
    { value: "billing",   label: t("dashboard.billing"),   Icon: CreditCard },
  ];

  useEffect(() => {
    if (searchParams.get("upgraded") === "1") {
      notify.success(t("dashboard.upgradedToast"));
      const url = new URL(window.location.href);
      url.searchParams.delete("upgraded");
      url.searchParams.delete("free");
      router.replace(url.pathname + (url.search || ""));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One capability object instead of four legacy tier-string checks; admin
  // and suspension handling come along for free. Launch mode is a server
  // concern and is already reflected in subscription_tier upgrades.
  const caps             = investorCan(buildAccessContext(profile, false));
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

  async function openBillingPortal() {
    if (viewingAs) return;
    const res = await fetch("/api/checkout/portal", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
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
      <div style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 40px 32px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div className="ruled-label" style={{ marginBottom: "10px" }}>{t("dashboard.investorDashboard")}</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 36px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "6px" }}>
              {profile.full_name || t("dashboard.yourPortfolio")}
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>
              {t("dashboard.membership", { tier: tierLabel })}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href="/dashboard/messages" style={outlineBtn}>
              <MessageSquare style={{ width: 13, height: 13 }} /> {t("dashboard.messages")}
            </Link>
            <Link href="/dashboard/team" style={outlineBtn}>
              <Users style={{ width: 13, height: 13 }} /> {t("team.navLabel")}
            </Link>
            <Link href="/dashboard/investor/settings" style={outlineBtn}>
              <Settings style={{ width: 13, height: 13 }} /> {t("dashboard.settings")}
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 40px 64px" }}>

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "32px" }}>
          {/* The deal counts were plain divs, so the two most important numbers
              on an investor's home screen -- how many deals are live, how many
              closed -- led nowhere, and the Deal Portal was reachable only
              through the top nav. They link now; the other two stay inert
              because their content is on this page already. */}
          {[
            { label: t("dashboard.watchlist"),   val: watchlist.length,  Icon: Bookmark,    href: null },
            { label: t("dashboard.activeDeals"), val: activeDeals,       Icon: TrendingUp,  href: "/deals" },
            { label: t("dashboard.closedDeals"), val: closedDeals,       Icon: CheckCircle2, href: "/deals" },
            { label: t("dashboard.aiReports"),   val: aiReports.length,  Icon: Brain,       href: null },
          ].map(({ label, val, Icon, href }) => {
            const card = (
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px 18px", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
                  <Icon style={{ width: 14, height: 14, color: "var(--cr-paper-4)" }} />
                </div>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "26px", color: "var(--cr-ink)" }}>{val}</p>
              </div>
            );
            return href
              ? <Link key={label} href={href} style={{ textDecoration: "none", display: "block" }}>{card}</Link>
              : <div key={label}>{card}</div>;
          })}
        </div>

        {/* Tab bar */}
        <div style={{ borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: "28px", display: "flex", gap: 0, overflowX: "auto" }}>
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
            <ErrorBoundary label="Recently viewed"><RecentlyViewedStrip /></ErrorBoundary>
            <ErrorBoundary label="Saved searches"><SavedSearchManager /></ErrorBoundary>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>
                {watchlist.length === 1 ? t("dashboard.savedCountOne") : t("dashboard.savedCount", { count: watchlist.length })}
              </p>
              {canExport && watchlist.length > 0 && (
                <button onClick={exportWatchlist} style={outlineBtn}>
                  <Download style={{ width: 12, height: 12 }} /> {t("dashboard.exportCsv")}
                </button>
              )}
            </div>
            {watchlist.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
                <Bookmark style={{ width: 36, height: 36, color: "var(--cr-ink-4)", marginBottom: "16px" }} />
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "18px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("dashboard.noSavedYet")}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", marginBottom: "24px" }}>
                  {t("dashboard.noSavedYetSub")}
                </p>
                <Link href="/startups" style={primaryBtn}>{t("dashboard.browseStartups")} →</Link>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" }}>
                {watchlist.map((w) => w.startup && (
                  <div key={w.id}>
                    <StartupCard startup={w.startup} investorTier={investor.subscription_tier} />
                    <WatchlistNote startupId={w.startup.id} initial={w.note ?? null} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AI Reports ── */}
        {activeTab === "portfolio" && (() => {
          const closed = deals.filter(d => d.status === "closed");
          const total = closed.reduce((a, d) => a + (d.amount ?? 0), 0);
          return closed.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
              <TrendingUp style={{ width: 36, height: 36, color: "var(--cr-ink-4)", marginBottom: "16px" }} />
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "18px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("dashboard.noPortfolio")}</h3>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)" }}>{t("dashboard.noPortfolioSub")}</p>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "20px" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "26px", color: "var(--cr-ink)" }}>{formatMoney(total, closed[0]?.currency ?? "USD")}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("dashboard.totalDeployed")} · {closed.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {closed.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "14px 18px" }}>
                    <Link href={d.startup?.slug ? `/startups/${d.startup.slug}` : `/deals?deal=${d.id}`}
                      style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", textDecoration: "none" }}>
                      {d.startup?.name ?? t("deals.startupFallback")}
                    </Link>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "14px", color: "var(--cr-up)", whiteSpace: "nowrap" }}>
                      {d.amount != null ? formatMoney(d.amount, d.currency ?? "USD") : "—"}
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginLeft: "10px" }}>{t("dashboard.closedOn", { date: formatDate(d.updated_at) })}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {activeTab === "reports" && (
          aiReports.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
              <Brain style={{ width: 36, height: 36, color: "var(--cr-ink-4)", marginBottom: "16px" }} />
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "18px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("dashboard.noAiReportsTitle")}</h3>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", marginBottom: "24px" }}>
                {canAi
                  ? t("dashboard.aiReportsHintPro")
                  : t("dashboard.aiReportsHintUpgrade")}
              </p>
              {!canAi && <Link href="/pricing" style={primaryBtn}>{t("dashboard.viewPlans")}</Link>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {aiReports.map((report) => (
                <div key={report.id} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Brain style={{ width: 15, height: 15, color: "var(--cr-copper)" }} />
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>
                        {report.startup?.name}
                      </span>
                      <span style={{ background: "transparent", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {report.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
                      {formatDate(report.created_at)}
                    </span>
                  </div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.65, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {report.content}
                  </p>
                  <Link href={`/startups/${report.startup?.slug}`}
                    style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none", display: "block", marginTop: "12px" }}>
                    {t("dashboard.viewStartup")} →
                  </Link>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Billing ── */}
        {activeTab === "billing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)", marginBottom: "20px" }}>{t("dashboard.membershipBilling")}</h3>

              {/* Current plan row */}
              <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px 18px", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
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
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Zap style={{ width: 12, height: 12, color: "var(--cr-copper)" }} /> {t("dashboard.accessLevel")}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {FEATURE_ROWS.map((item) => {
                    const unlocked = "unlocked" in item ? item.unlocked : isUnlocked(item.key);
                    return (
                      <div key={item.labelKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {unlocked
                            ? <CheckCircle2 style={{ width: 14, height: 14, color: "var(--cr-up)", flexShrink: 0 }} />
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

                {investor.subscription_tier === "free" && (
                  <div style={{ marginTop: "24px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "18px 20px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-copper)", marginBottom: "6px" }}>
                      {t("dashboard.upgradeAngel")}
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", marginBottom: "16px" }}>
                      {t("dashboard.upgradeAngelSub")}
                    </p>
                    <Link href="/pricing" style={primaryBtn}>{t("dashboard.viewAllPlans")}</Link>
                  </div>
                )}
              </div>
            </div>
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
