"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DealKanban } from "@/components/shared/deal-kanban";
import { notify } from "@/components/ui/toast-notify";
import {
  Eye, Bookmark, MessageSquare, TrendingUp, Brain,
  CheckCircle2, Circle, ExternalLink, Settings, CreditCard,
  FileText, AlertCircle, Lock, Zap, LayoutGrid,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Profile, Startup, Deal, DealStatus } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  profile:      Profile;
  startup:      Startup | null;
  analytics:    { views: number; saves: number; deals: number };
  deals:        Deal[];
  isLaunchMode: boolean;
}

const TABS = [
  { value: "overview",   label: "Overview"      },
  { value: "deals",      label: "Deal Pipeline" },
  { value: "documents",  label: "Documents"     },
  { value: "ai",         label: "AI Feedback"   },
  { value: "billing",    label: "Billing"       },
] as const;
type StartupTab = typeof TABS[number]["value"];

// ── Profile completion ────────────────────────────────────────────────────────

function getProfileCompletion(s: Startup) {
  const checks: [boolean, string][] = [
    [!!s.tagline,                                     "Add a tagline"                ],
    [!!s.problem,                                     "Describe the problem"         ],
    [!!s.solution,                                    "Describe your solution"       ],
    [!!s.market,                                      "Define your target market"    ],
    [!!s.competitive_advantage,                       "Add competitive advantage"    ],
    [!!s.funding_target,                              "Set your funding target"      ],
    [!!s.use_of_funds,                                "Add use of funds"             ],
    [(s.founders?.length ?? 0) > 0,                  "Add at least one founder"     ],
    [(s.founders ?? []).some((f) => f.linkedin_url), "Add a founder LinkedIn"       ],
    [(s.documents?.length ?? 0) > 0,                 "Upload a pitch deck"          ],
    [(s.milestones?.length ?? 0) > 0,                "Add at least one milestone"   ],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
  return { score: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    active:         { bg: "var(--cr-up-bg)",     color: "var(--cr-up)",      border: "rgba(45,106,79,0.25)" },
    pending_review: { bg: "rgba(245,158,11,0.08)", color: "#B45309",          border: "rgba(180,83,9,0.25)"  },
    suspended:      { bg: "var(--cr-down-bg)",   color: "var(--cr-down)",    border: "rgba(180,50,50,0.2)"  },
    draft:          { bg: "var(--cr-paper-3)",   color: "var(--cr-ink-4)",   border: "var(--cr-rule)"       },
  };
  const s = styles[status] || styles.draft;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Shared btn styles ─────────────────────────────────────────────────────────

const outlineBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)",
  borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
  fontSize: "13px", color: "var(--cr-ink-3)", padding: "7px 14px", cursor: "pointer",
  textDecoration: "none",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  background: "var(--cr-copper)", border: "none", borderRadius: "4px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
  color: "#fff", padding: "8px 18px", cursor: "pointer", textDecoration: "none",
};

// ── Visibility feature rows ───────────────────────────────────────────────────

const VIS_ROWS = [
  { label: "Company name & tagline",  always: true },
  { label: "Team bios & founders",    tier: "Starter", key: "docs" },
  { label: "Pitch deck & documents",  tier: "Starter", key: "docs" },
  { label: "Investor messaging",      tier: "Starter", key: "docs" },
  { label: "MRR, ARR & financials",   tier: "Growth",  key: "growth" },
  { label: "Demo video embed",        tier: "Growth",  key: "growth" },
  { label: "AI CapitalReach score",   tier: "Growth",  key: "growth" },
  { label: "Featured in search",      tier: "Growth",  key: "growth" },
] as const;

// ── Main ──────────────────────────────────────────────────────────────────────

export function StartupDashboardClient({ profile, startup, analytics, deals, isLaunchMode }: Props) {
  const router       = useRouter();
  const [aiFeedback, setAiFeedback]           = useState<any>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [activeTab, setActiveTab]             = useState<StartupTab>("overview");

  const { score, missing } = startup
    ? getProfileCompletion(startup)
    : { score: 0, missing: ["Complete onboarding"] };

  const tier             = startup?.subscription_tier || "free";
  const canDocs          = isLaunchMode || tier === "starter" || tier === "growth";
  const canGrowth        = isLaunchMode || tier === "growth";

  async function handleDealStatusChange(dealId: string, status: DealStatus) {
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, status }) });
    if (!res.ok) notify.error("Failed to update deal"); else router.refresh();
  }

  async function handleDealClose(dealId: string, amount: number) {
    const res = await fetch("/api/deals/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, amount }) });
    const data = await res.json();
    if (!res.ok) { notify.error(data.error || "Failed to close deal"); }
    else { notify.success(amount ? `Deal closed at ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount)}` : "Deal marked as closed."); router.refresh(); }
  }

  async function generatePitchFeedback() {
    if (!startup) return;
    setLoadingFeedback(true);
    const res = await fetch("/api/ai/pitch-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId: startup.id }) });
    setAiFeedback(await res.json());
    setLoadingFeedback(false);
  }

  async function openBillingPortal() {
    const res = await fetch("/api/checkout/portal", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
  }

  // ── No startup yet ──
  if (!startup) {
    return (
      <main style={{ background: "var(--cr-paper)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "60px 24px" }}>
        <div style={{ width: 56, height: 56, borderRadius: "4px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
          <LayoutGrid style={{ width: 24, height: 24, color: "var(--cr-ink-4)" }} />
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "28px", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "12px" }}>Set up your startup profile</h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", maxWidth: "400px", marginBottom: "28px" }}>
          Create your listing to start attracting investors on CapitalReach.
        </p>
        <Link href="/onboarding/startup" style={primaryBtn}>Create Your Profile</Link>
      </main>
    );
  }

  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 40px 32px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div className="ruled-label" style={{ marginBottom: "10px" }}>Startup Dashboard</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(26px, 4vw, 34px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "10px" }}>
              {startup.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <StatusBadge status={startup.status} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>
                {tier} plan
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href={`/startups/${startup.slug}`} target="_blank" style={outlineBtn}>
              <ExternalLink style={{ width: 12, height: 12 }} /> View Listing
            </Link>
            <Link href="/dashboard/startup/edit" style={outlineBtn}>
              <Settings style={{ width: 12, height: 12 }} /> Edit Profile
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 40px 64px" }}>

        {/* Review banner */}
        {startup.status === "pending_review" && (
          <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(180,83,9,0.2)", borderRadius: "4px", padding: "14px 18px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle style={{ width: 16, height: 16, color: "#B45309", flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#B45309" }}>Profile under review</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "#92400E" }}>Our team will approve your listing within 1–2 business days.</p>
            </div>
          </div>
        )}

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "32px" }}>
          {[
            { label: "Profile Views (30d)", val: analytics.views,                      Icon: Eye           },
            { label: "Investor Saves",      val: analytics.saves,                      Icon: Bookmark      },
            { label: "Active Deals",        val: analytics.deals,                      Icon: MessageSquare },
            { label: "AI Score",            val: startup.vaultrise_score ?? "—",       Icon: TrendingUp    },
          ].map(({ label, val, Icon }) => (
            <div key={label} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
                <Icon style={{ width: 13, height: 13, color: "var(--cr-paper-4)" }} />
              </div>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "26px", color: "var(--cr-ink)" }}>{val}</p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: "28px", display: "flex", overflowX: "auto" }}>
          {TABS.filter(t => t.value !== "ai" || canGrowth).map(({ value, label }) => (
            <button key={value} onClick={() => setActiveTab(value)}
              style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: activeTab === value ? 600 : 300, fontSize: "13px", color: activeTab === value ? "var(--cr-ink)" : "var(--cr-ink-4)", padding: "10px 18px 9px", whiteSpace: "nowrap", borderBottom: activeTab === value ? "2px solid var(--cr-copper)" : "2px solid transparent", transition: "color 100ms, border-color 100ms" }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: "20px" }}>
            {/* Profile completion */}
            <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "16px" }}>Profile Completion</h3>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "10px" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "40px", color: "var(--cr-copper)", lineHeight: 1 }}>{score}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "18px", color: "var(--cr-ink-4)" }}>%</span>
              </div>
              {/* Progress track */}
              <div style={{ height: "3px", background: "var(--cr-paper-4)", borderRadius: "2px", marginBottom: "16px" }}>
                <div style={{ height: "3px", background: "var(--cr-copper)", borderRadius: "2px", width: `${score}%`, transition: "width 600ms ease" }} />
              </div>
              {missing.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-up)" }}>
                  <CheckCircle2 style={{ width: 14, height: 14 }} /> Profile complete!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  {missing.slice(0, 5).map((m) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Circle style={{ width: 10, height: 10, color: "var(--cr-paper-4)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>{m}</span>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/dashboard/startup/edit" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "36px", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", textDecoration: "none", marginTop: "8px" }}>
                Complete Profile
              </Link>
            </div>

            {/* Right col */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Quick actions */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px" }}>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "14px" }}>Quick Actions</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    { href: "/dashboard/messages",       Icon: MessageSquare, label: "Messages"    },
                    { href: "/dashboard/startup/edit",   Icon: Settings,      label: "Edit Profile" },
                    { href: "/pricing",                  Icon: TrendingUp,    label: "Upgrade Plan" },
                    { href: `/startups/${startup.slug}`, Icon: ExternalLink,  label: "Public View", ext: true },
                  ].map(({ href, Icon, label, ext }) => (
                    <Link key={label} href={href} {...(ext ? { target: "_blank" } : {})}
                      style={{ display: "flex", alignItems: "center", gap: "6px", border: "1px solid var(--cr-rule)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", padding: "8px 12px", textDecoration: "none" }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink)")}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)")}>
                      <Icon style={{ width: 12, height: 12 }} /> {label}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Subscription */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", textTransform: "capitalize" }}>{tier} Plan</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>
                    {tier === "free" ? "Upgrade to get publicly listed" : "Active subscription"}
                  </p>
                </div>
                {tier === "free"
                  ? <Link href="/pricing" style={primaryBtn}>Upgrade</Link>
                  : <button onClick={openBillingPortal} style={outlineBtn}><CreditCard style={{ width: 12, height: 12 }} /> Manage</button>}
              </div>

              {/* Profile visibility */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px" }}>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Zap style={{ width: 13, height: 13, color: "var(--cr-copper)" }} /> Profile Visibility
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {VIS_ROWS.map((row) => {
                    const unlocked = "always" in row ? true : ("key" in row && row.key === "docs" ? canDocs : canGrowth);
                    return (
                      <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {unlocked
                            ? <CheckCircle2 style={{ width: 13, height: 13, color: "var(--cr-up)", flexShrink: 0 }} />
                            : <Lock style={{ width: 13, height: 13, color: "var(--cr-ink-4)", flexShrink: 0 }} />}
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: unlocked ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>{row.label}</span>
                        </div>
                        {!unlocked && (row as any).tier && (
                          <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px" }}>
                            {(row as any).tier}+
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {tier === "free" && (
                  <Link href="/pricing" style={{ ...primaryBtn, display: "flex", justifyContent: "center", marginTop: "16px", width: "100%", boxSizing: "border-box" }}>
                    Unlock More Profile Info
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Deals ── */}
        {activeTab === "deals" && (
          <DealKanban deals={deals} onStatusChange={handleDealStatusChange} onDealClose={handleDealClose} viewAs="startup" revealIdentity={canDocs} />
        )}

        {/* ── Documents ── */}
        {activeTab === "documents" && (
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)" }}>Uploaded Documents</h3>
              <Link href="/dashboard/startup/documents" style={primaryBtn}>
                <FileText style={{ width: 12, height: 12 }} /> Manage
              </Link>
            </div>
            {startup.documents && startup.documents.length > 0 ? (
              <div>
                {startup.documents.map((doc, i) => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: i < startup.documents!.length - 1 ? "1px solid var(--cr-rule)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: 34, height: 34, borderRadius: "3px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FileText style={{ width: 14, height: 14, color: "var(--cr-copper)" }} />
                      </div>
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)" }}>{doc.label}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>{doc.type.replace(/_/g, " ")}</p>
                      </div>
                      {doc.requires_nda && (
                        <span style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(180,83,9,0.2)", color: "#B45309", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", borderRadius: "3px", padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          NDA Required
                        </span>
                      )}
                    </div>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                      View
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>
                No documents uploaded. Add your pitch deck to attract investors.
              </p>
            )}
          </div>
        )}

        {/* ── AI Feedback — Growth only ── */}
        {activeTab === "ai" && canGrowth && (
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <Brain style={{ width: 20, height: 20, color: "var(--cr-copper)" }} />
              <div>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)" }}>AI Pitch Feedback</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>Structured feedback on your pitch from Claude</p>
              </div>
            </div>
            {!aiFeedback ? (
              <button onClick={generatePitchFeedback} disabled={loadingFeedback} style={{ ...primaryBtn, opacity: loadingFeedback ? 0.6 : 1 }}>
                {loadingFeedback ? "Analyzing…" : "Generate Feedback"}
              </button>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "20px" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "40px", color: "var(--cr-copper)", lineHeight: 1 }}>{aiFeedback.overall_score}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "18px", color: "var(--cr-ink-4)" }}>/100</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                  {[
                    { key: "clarity",                 label: "Narrative Clarity"       },
                    { key: "market_sizing",           label: "Market Sizing"           },
                    { key: "competitive_positioning", label: "Competitive Positioning" },
                    { key: "missing_information",     label: "What's Missing"          },
                  ].map(({ key, label }) => (
                    <div key={key} style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "16px 18px" }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>{label}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiFeedback[key]}</p>
                    </div>
                  ))}
                </div>
                <button onClick={generatePitchFeedback} style={outlineBtn}>Regenerate</button>
              </div>
            )}
          </div>
        )}

        {/* ── Billing ── */}
        {activeTab === "billing" && (
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
            <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)", marginBottom: "20px" }}>Subscription &amp; Billing</h3>
            <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px 18px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", textTransform: "capitalize" }}>{tier} Plan</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{profile.subscription_status || "Active"}</p>
              </div>
              <button onClick={openBillingPortal} style={outlineBtn}>
                <CreditCard style={{ width: 12, height: 12 }} /> Manage Billing
              </button>
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", lineHeight: 1.7 }}>
              Manage your subscription, update payment methods, and view invoice history through the Stripe Customer Portal.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
