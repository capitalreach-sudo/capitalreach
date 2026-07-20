"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { StartupCard } from "@/components/startup/startup-card";
import { DealKanban } from "@/components/shared/deal-kanban";
import { notify } from "@/components/ui/toast-notify";
import {
  Brain, CreditCard, Download, Bookmark, MessageSquare,
  Settings, TrendingUp, Lock, CheckCircle2, Zap,
} from "lucide-react";
import {
  canExportData, canGetAiDueDiligence, canAccessFinancials, canSendMessages,
} from "@/types";
import { formatDate } from "@/lib/utils";
import type { Profile, Investor, Watchlist, Deal, AiReport, DealStatus } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  profile:    Profile;
  investor:   Investor;
  watchlist:  Watchlist[];
  deals:      Deal[];
  aiReports:  AiReport[];
}

type InvestorTab = "watchlist" | "deals" | "reports" | "billing";

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

// ── Component ─────────────────────────────────────────────────────────────────

export function InvestorDashboardClient({ profile, investor, watchlist, deals, aiReports }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { t }        = useTranslation();
  const [activeTab, setActiveTab] = useState<InvestorTab>("watchlist");

  const TABS: { value: InvestorTab; label: string; Icon: React.ElementType }[] = [
    { value: "watchlist", label: t("dashboard.watchlist"), Icon: Bookmark   },
    { value: "deals",     label: t("dashboard.dealFlow"),  Icon: TrendingUp },
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

  const canExport        = canExportData(investor.subscription_tier);
  const canSeeFinancials = canAccessFinancials(investor.subscription_tier);
  const canMsg           = canSendMessages(investor.subscription_tier);
  const canAi            = canGetAiDueDiligence(investor.subscription_tier);

  const tierLabel = investor.subscription_tier === "free"
    ? "Explorer"
    : investor.subscription_tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  async function handleDealStatusChange(dealId: string, status: DealStatus) {
    const res = await fetch("/api/deals/update", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, status }),
    });
    if (!res.ok) notify.error(t("dashboard.dealUpdateFailed"));
    else router.refresh();
  }

  async function handleDealClose(dealId: string, amount: number) {
    const res = await fetch("/api/deals/close", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, amount }),
    });
    const data = await res.json();
    if (!res.ok) {
      notify.error(data.error || t("dashboard.dealCloseFailed"));
    } else {
      const fmt = amount
        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount)
        : null;
      notify.success(fmt ? t("dashboard.dealClosedAt", { amount: fmt }) : t("dashboard.dealClosed"));
      router.refresh();
    }
  }

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
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>

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
            <Link href="/dashboard/investor/settings" style={outlineBtn}>
              <Settings style={{ width: 13, height: 13 }} /> {t("dashboard.settings")}
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 40px 64px" }}>

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "32px" }}>
          {[
            { label: t("dashboard.watchlist"),   val: watchlist.length,  Icon: Bookmark    },
            { label: t("dashboard.activeDeals"), val: activeDeals,       Icon: TrendingUp  },
            { label: t("dashboard.closedDeals"), val: closedDeals,       Icon: CheckCircle2 },
            { label: t("dashboard.aiReports"),   val: aiReports.length,  Icon: Brain       },
          ].map(({ label, val, Icon }) => (
            <div key={label} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
                <Icon style={{ width: 14, height: 14, color: "var(--cr-paper-4)" }} />
              </div>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "26px", color: "var(--cr-ink)" }}>{val}</p>
            </div>
          ))}
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
                  <StartupCard key={w.id} startup={w.startup as any} investorTier={investor.subscription_tier} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Deal flow ── */}
        {activeTab === "deals" && (
          <DealKanban deals={deals} onStatusChange={handleDealStatusChange} onDealClose={handleDealClose} viewAs="investor" />
        )}

        {/* ── AI Reports ── */}
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
                        {(report as any).startup?.name}
                      </span>
                      <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
                  <Link href={`/startups/${(report as any).startup?.slug}`}
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
                    const unlocked = "unlocked" in item ? item.unlocked : isUnlocked((item as any).key);
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
                        {!unlocked && (item as any).tier && (
                          <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px", whiteSpace: "nowrap" }}>
                            {(item as any).tier}+
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

      {/* ── Mobile bottom nav ── */}
      <nav style={{ display: "none" }} className="sm:hidden" aria-label="Dashboard tabs">
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: "var(--cr-paper-2)", borderTop: "1px solid var(--cr-rule-dark)", display: "flex" }}>
          {TABS.map(({ value, label, Icon }) => (
            <button key={value} onClick={() => setActiveTab(value)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "10px 0 12px", background: "none", border: "none", cursor: "pointer", color: activeTab === value ? "var(--cr-copper)" : "var(--cr-ink-4)" }}>
              <Icon style={{ width: 18, height: 18 }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px" }}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
