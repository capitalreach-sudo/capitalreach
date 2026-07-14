"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { StartupCard } from "./startup-card";
import {
  Globe, Share2, Eye, FileText,
  MessageSquare, Brain, Lock, ExternalLink,
  ChevronLeft, Bookmark, X,
} from "lucide-react";
import {
  formatCurrency, formatNumber, formatDate, formatPercent,
  STAGE_LABELS, getInitials,
} from "@/lib/utils";
import { canViewFinancials, canSendMessages as canSendMessagesAccess, canAiDueDiligence } from "@/lib/access";
import { GateBlur } from "@/components/ui/GateBlur";
import type { Startup, SubscriptionTier } from "@/types";
import { notify } from "@/components/ui/toast-notify";
import { PrintButton } from "@/components/ui/PrintButton";
import { PrintHeader } from "@/components/ui/PrintHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { ScoreRing } from "@/components/ui/ScoreRing";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  startup:        Startup;
  investorTier:   SubscriptionTier | null;
  investorId:     string | null;
  ndaSigned:      boolean;
  relatedStartups: Startup[];
  isLaunchMode:   boolean;
}

const TABS = ["overview", "team", "financials", "documents", "traction"] as const;
type Tab = typeof TABS[number];

// ── Section text block ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "10px", letterSpacing: "-0.01em" }}>{title}</h3>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.7 }}>{children}</p>
    </div>
  );
}

// ── Metric cell ───────────────────────────────────────────────────────────────

function MetricCell({ label, value, copper }: { label: string; value: string | null; copper?: boolean }) {
  return (
    <div style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", padding: "12px 14px 10px" }}>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "20px", color: copper ? "var(--cr-copper)" : value ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function StartupDetailClient({
  startup, investorTier, investorId, ndaSigned, relatedStartups, isLaunchMode,
}: Props) {
  const [activeTab, setActiveTab]               = useState<Tab>("overview");
  const [isSaved, setIsSaved]                   = useState(false);
  const [viewerCount, setViewerCount]           = useState(1);
  const [messageOpen, setMessageOpen]           = useState(false);
  const [messageBody, setMessageBody]           = useState("");
  const [sendingMessage, setSendingMessage]     = useState(false);
  const [aiReport, setAiReport]                 = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [ndaLoading, setNdaLoading]             = useState(false);
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const accessCtx = { userId: investorId, role: investorId ? "investor" as const : null, tier: investorTier, isLaunchMode };
  const canFinancials = canViewFinancials(accessCtx);
  const canMessage    = canSendMessagesAccess(accessCtx);
  const canAi          = canAiDueDiligence(accessCtx);

  // Live viewer presence
  useEffect(() => {
    const channel = supabase.channel(`startup:${startup.id}`, {
      config: { presence: { key: `viewer-${Math.random()}` } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        setViewerCount(Object.keys(channel.presenceState()).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ startup_id: startup.id });
      });
    return () => { supabase.removeChannel(channel); };
  }, [startup.id, supabase]);

  // Check saved
  useEffect(() => {
    if (!investorId) return;
    supabase
      .from("watchlists")
      .select("id")
      .match({ investor_id: investorId, startup_id: startup.id })
      .single()
      .then(({ data }) => setIsSaved(!!data));
  }, [investorId, startup.id, supabase]);

  async function toggleSave() {
    if (!investorId) { notify.info("Sign in as an investor to save startups"); return; }
    if (isSaved) {
      await supabase.from("watchlists").delete().match({ investor_id: investorId, startup_id: startup.id });
      setIsSaved(false);
      notify.info("Removed from watchlist");
    } else {
      await supabase.from("watchlists").insert({ investor_id: investorId, startup_id: startup.id });
      setIsSaved(true);
      notify.success("Saved to watchlist");
    }
  }

  async function sendMessage() {
    if (!investorId || !canMessage) return;
    setSendingMessage(true);
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: startup.id, investorId, body: messageBody }),
    });
    setSendingMessage(false);
    if (res.ok) {
      setMessageOpen(false);
      setMessageBody("");
      notify.success("Message sent!");
    } else {
      const err = await res.json();
      notify.error(err.error || "Failed to send message");
    }
  }

  async function generateAiReport() {
    if (!canAi) return;
    setGeneratingReport(true);
    const res = await fetch("/api/ai/due-diligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: startup.id }),
    });
    const data = await res.json();
    setAiReport(data.report ?? null);
    setGeneratingReport(false);
  }

  async function requestNda() {
    setNdaLoading(true);
    const res = await fetch("/api/nda/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: startup.id, investorId }),
    });
    setNdaLoading(false);
    if (res.ok) notify.success("NDA sent to both parties for signing");
    else notify.error("Failed to send NDA");
  }

  const { t } = useTranslation();
  const score = startup.vaultrise_score ?? null;

  const TAB_LABELS: Record<Tab, string> = {
    overview:   t("startupDetail.overview"),
    team:       t("startupDetail.team"),
    financials: t("startupDetail.financials"),
    documents:  t("startupDetail.documents"),
    traction:   "Traction",
  };

  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>
      <PrintHeader title={startup.name} />

      {/* ── Editorial hero ── */}
      <div style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 40px 36px" }}>

          {/* Back link */}
          <Link href="/startups" style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
            color: "var(--cr-ink-4)", textDecoration: "none", marginBottom: "28px",
          }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-2)")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-4)")}
          >
            <ChevronLeft style={{ width: 14, height: 14 }} />
            {t("startupDetail.backToListings")}
          </Link>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Top row: logo + info + actions */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>

              {/* Logo */}
              <div style={{
                width: 60, height: 60, borderRadius: "4px", flexShrink: 0,
                background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "20px",
                color: "var(--cr-copper)",
              }}>
                {getInitials(startup.name)}
              </div>

              {/* Name + tagline */}
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
                  <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 38px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                    {startup.name}
                  </h1>
                  {startup.subscription_tier === "growth" && (
                    <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Featured
                    </span>
                  )}
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", marginBottom: "12px" }}>
                  {startup.tagline}
                </p>

                {/* Badge row */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                  <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {startup.industry}
                  </span>
                  <span style={{ background: "var(--cr-paper-4)", border: "1px solid var(--cr-rule)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", borderRadius: "3px", padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {STAGE_LABELS[startup.stage] ?? startup.stage}
                  </span>
                  {startup.country && (
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>
                      {startup.country}
                    </span>
                  )}
                  {viewerCount > 1 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
                      <Eye style={{ width: 11, height: 11 }} /> {viewerCount} viewing
                    </span>
                  )}
                  {score != null && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <ScoreRing score={score} size={32} strokeWidth={3} />
                    </div>
                  )}
                </div>
              </div>

              {/* New profile fields: looking_for, social_proof, languages */}
              {((startup as any).looking_for?.length || (startup as any).social_proof?.length || (startup as any).languages?.length) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {((startup as any).looking_for as string[] | null)?.map((item: string) => (
                    <span key={item} style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-2)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", borderRadius: "3px", padding: "3px 8px" }}>
                      {item}
                    </span>
                  ))}
                  {((startup as any).social_proof as Array<{ type: string; value: string }> | null)?.map((sp, i) => (
                    <span key={i} style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", borderRadius: "3px", padding: "3px 8px" }}>
                      {sp.value}
                    </span>
                  ))}
                  {((startup as any).deck_language && (startup as any).deck_language !== "English") && (
                    <span style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", borderRadius: "3px", padding: "3px 8px" }}>
                      Deck: {(startup as any).deck_language}
                    </span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                {startup.website && (
                  <a href={startup.website} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", padding: "8px 14px", textDecoration: "none", cursor: "pointer" }}>
                    <Globe style={{ width: 13, height: 13 }} /> Website
                  </a>
                )}
                <button onClick={toggleSave} style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: isSaved ? "var(--cr-copper)" : "var(--cr-ink-3)", padding: "8px 14px", cursor: "pointer" }}>
                  <Bookmark style={{ width: 13, height: 13, fill: isSaved ? "var(--cr-copper)" : "transparent" }} />
                  {isSaved ? t("toast.saved") : t("common.saveWatchlist")}
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.href); notify.success(t("toast.linkCopied")); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", padding: "8px 14px", cursor: "pointer" }}>
                  <Share2 style={{ width: 13, height: 13 }} /> {t("common.share")}
                </button>
                <PrintButton label="Export PDF" />
                {canMessage ? (
                  <button onClick={() => setMessageOpen(true)}
                    className="btn-copper-shimmer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--cr-copper)", border: "1px solid var(--cr-copper-d)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "8px 18px", cursor: "pointer" }}>
                    <MessageSquare style={{ width: 13, height: 13 }} /> {t("startupDetail.requestIntro")}
                  </button>
                ) : (
                  <Link href="/pricing"
                    className="btn-copper-shimmer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--cr-copper)", border: "1px solid var(--cr-copper-d)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "8px 18px", textDecoration: "none" }}>
                    <Lock style={{ width: 13, height: 13 }} /> {t("common.upgrade")}
                  </Link>
                )}
              </div>
            </div>

            {/* Key metrics strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
              <MetricCell label={t("startupDetail.raising")} value={formatCurrency(startup.funding_target, true)} copper />
              <MetricCell label="Equity"    value={startup.equity_offered != null ? `${startup.equity_offered}%` : null} />
              <MetricCell label="Min Check" value={startup.min_check_size ? formatCurrency(startup.min_check_size, true) : "Open"} />
              <MetricCell label="Views"     value={formatNumber(startup.pageviews ?? 0)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 40px 64px" }}>

        {/* AI report CTA */}
        {canAi && !aiReport && (
          <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "16px 20px", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Brain style={{ width: 20, height: 20, color: "var(--cr-copper)", flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "2px" }}>AI Due Diligence Report</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>500-word investment analysis powered by Claude</p>
              </div>
            </div>
            <button onClick={generateAiReport} disabled={generatingReport}
              style={{ background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "8px 20px", cursor: "pointer", whiteSpace: "nowrap", opacity: generatingReport ? 0.6 : 1 }}>
              {generatingReport ? "Generating…" : "Generate Report"}
            </button>
          </div>
        )}

        {aiReport && (
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "24px", marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Brain style={{ width: 16, height: 16, color: "var(--cr-copper)" }} />
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>AI Due Diligence Report</h3>
              <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Claude</span>
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{aiReport}</p>
          </div>
        )}

        {/* ── Custom tab bar ── */}
        <div style={{ borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: "28px", display: "flex", gap: "0" }}>
          {TABS.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", fontWeight: activeTab === tab ? 600 : 300,
                fontSize: "13px", color: activeTab === tab ? "var(--cr-ink)" : "var(--cr-ink-4)",
                padding: "10px 18px 9px", textTransform: "capitalize",
                borderBottom: activeTab === tab ? "2px solid var(--cr-copper)" : "2px solid transparent",
                transition: "color 100ms ease, border-color 100ms ease",
              }}>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ── */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {startup.problem             && <Section title="The Problem">{startup.problem}</Section>}
            {startup.solution            && <Section title="Our Solution">{startup.solution}</Section>}
            {startup.market              && <Section title="Target Market">{startup.market}</Section>}
            {startup.competitive_advantage && <Section title="Competitive Advantage">{startup.competitive_advantage}</Section>}
            {startup.use_of_funds        && <Section title="Use of Funds">{startup.use_of_funds}</Section>}

            {/* Milestones */}
            {startup.milestones && startup.milestones.length > 0 && (
              <div>
                <div className="ruled-label" style={{ marginBottom: "16px" }}>Milestones</div>
                <div>
                  {[...startup.milestones]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((m, idx, arr) => (
                      <div key={m.id} style={{ display: "flex", gap: "16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "1px", background: "var(--cr-copper)", transform: "rotate(45deg)", marginTop: "5px", flexShrink: 0 }} />
                          {idx < arr.length - 1 && (
                            <div style={{ width: 1, flex: 1, background: "var(--cr-rule-dark)", margin: "4px 0" }} />
                          )}
                        </div>
                        <div style={{ paddingBottom: "20px" }}>
                          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "4px" }}>{formatDate(m.date)}</p>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)" }}>{m.description}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Video pitch (new field) */}
            {(startup as any).video_pitch_url && (
              <div>
                <div className="ruled-label" style={{ marginBottom: "16px" }}>Pitch Video</div>
                <div style={{ aspectRatio: "16/9", borderRadius: "6px", overflow: "hidden", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)" }}>
                  <iframe
                    src={((startup as any).video_pitch_url as string)
                      .replace("watch?v=", "embed/")
                      .replace("youtu.be/", "youtube.com/embed/")
                      .replace("loom.com/share/", "loom.com/embed/")}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            {/* Demo video */}
            {(startup as any).demo_video_url && startup.subscription_tier === "growth" && (
              <div>
                <div className="ruled-label" style={{ marginBottom: "16px" }}>Product Demo</div>
                {canFinancials ? (
                  <div style={{ aspectRatio: "16/9", borderRadius: "4px", overflow: "hidden", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)" }}>
                    <iframe
                      src={(startup as any).demo_video_url
                        .replace("watch?v=", "embed/")
                        .replace("youtu.be/", "youtube.com/embed/")}
                      style={{ width: "100%", height: "100%" }}
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div style={{ aspectRatio: "16/9", borderRadius: "4px", background: "var(--cr-paper-3)", border: "1px dashed var(--cr-paper-4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                    <Lock style={{ width: 24, height: 24, color: "var(--cr-ink-4)" }} />
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)" }}>Upgrade to Angel to watch the product demo</p>
                    <Link href="/pricing" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>View plans →</Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Team ── */}
        {activeTab === "team" && (
          startup.founders && startup.founders.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
              {startup.founders.map((f) => (
                <div key={f.id} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "4px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                      {f.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.photo_url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "16px", color: "var(--cr-copper)" }}>{getInitials(f.name)}</span>
                      )}
                    </div>
                    <div>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>{f.name}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>{f.role}</p>
                    </div>
                  </div>
                  {(f as any).bio && (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.65, marginBottom: "14px" }}>{(f as any).bio}</p>
                  )}
                  <div style={{ display: "flex", gap: "14px" }}>
                    {f.linkedin_url && (
                      <a href={f.linkedin_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>LinkedIn</a>
                    )}
                    {(f as any).twitter_url && (
                      <a href={(f as any).twitter_url.startsWith("http") ? (f as any).twitter_url : `https://x.com/${(f as any).twitter_url.replace("@", "")}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>X / Twitter</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>Team information not provided.</p>
          )
        )}

        {/* ── Tab: Financials ── */}
        {activeTab === "financials" && (
          canFinancials ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
              <MetricCell label={t("startupDetail.mrr")}    value={startup.mrr         ? formatCurrency(startup.mrr)        : null} />
              <MetricCell label={t("startupDetail.arr")}    value={startup.arr         ? formatCurrency(startup.arr)        : null} />
              <MetricCell label="Total Users"               value={startup.user_count  ? formatNumber(startup.user_count)   : null} />
              <MetricCell label={t("startupDetail.growth")} value={startup.growth_rate  ? formatPercent(startup.growth_rate) : null} />
            </div>
          ) : (
            <GateBlur
              title="Angel tier required"
              description="Upgrade to Angel to see MRR, ARR, growth rate, and full financial data."
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                <MetricCell label="MRR" value="$42,000" />
                <MetricCell label="ARR" value="$504,000" />
                <MetricCell label="Total Users" value="3,200" />
                <MetricCell label="MoM Growth" value="14%" />
              </div>
            </GateBlur>
          )
        )}

        {/* ── Tab: Documents ── */}
        {activeTab === "documents" && (
          <>
            {/* Unauthenticated teaser */}
            {!investorId && startup.documents && startup.documents.length > 0 && (
              <div style={{ position: "relative", borderRadius: "4px", overflow: "hidden", border: "1px solid var(--cr-rule-dark)", marginBottom: "16px", minHeight: "120px" }}>
                <div style={{ position: "absolute", inset: 0, filter: "blur(4px)", background: "var(--cr-paper-3)", display: "flex", alignItems: "center", padding: "24px" }}>
                  <div style={{ width: "100%" }}>
                    {[75, 55, 40].map((w, i) => (
                      <div key={i} className="skeleton" style={{ height: 12, width: `${w}%`, borderRadius: "2px", marginBottom: "10px" }} />
                    ))}
                  </div>
                </div>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(245,240,232,0.95) 40%, transparent)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: "20px" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "12px" }}>Sign up to view the full pitch deck</p>
                  <Link href="/auth/signup" style={{ background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "9px 22px", borderRadius: "4px", textDecoration: "none" }}>
                    Create free account →
                  </Link>
                </div>
              </div>
            )}

            {startup.documents && startup.documents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {startup.documents.map((doc) => {
                  const requiresUpgrade = !canFinancials;
                  const requiresNda     = doc.requires_nda && startup.require_nda && !ndaSigned;

                  return (
                    <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: 36, height: 36, borderRadius: "3px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <FileText style={{ width: 16, height: 16, color: "var(--cr-copper)" }} />
                        </div>
                        <div>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)" }}>{doc.label}</p>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>{doc.type.replace(/_/g, " ")}</p>
                        </div>
                      </div>
                      {requiresNda && !ndaSigned ? (
                        <button onClick={requestNda} disabled={ndaLoading}
                          style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", padding: "7px 14px", cursor: "pointer", opacity: ndaLoading ? 0.6 : 1 }}>
                          <Lock style={{ width: 11, height: 11 }} />
                          {ndaLoading ? "Sending NDA…" : "Sign NDA to Access"}
                        </button>
                      ) : requiresUpgrade ? (
                        <Link href="/pricing" style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", padding: "7px 14px", textDecoration: "none" }}>
                          <Lock style={{ width: 11, height: 11 }} /> Upgrade
                        </Link>
                      ) : (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "#fff", padding: "7px 14px", textDecoration: "none" }}>
                          <ExternalLink style={{ width: 11, height: 11 }} /> View
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>No documents uploaded yet.</p>
            )}
          </>
        )}

        {/* ── Tab: Traction ── */}
        {activeTab === "traction" && (
          canFinancials ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
              <MetricCell label="Monthly Revenue" value={startup.mrr         ? formatCurrency(startup.mrr)        : null} copper />
              <MetricCell label="Annual Revenue"  value={startup.arr         ? formatCurrency(startup.arr)        : null} />
              <MetricCell label="Total Users"     value={startup.user_count  ? formatNumber(startup.user_count)   : null} />
              <MetricCell label="MoM Growth"      value={startup.growth_rate  ? formatPercent(startup.growth_rate) : null} />
            </div>
          ) : (
            <GateBlur
              title="Upgrade to see traction data"
              description="Angel members see MRR, ARR, user counts, and growth rates."
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                <MetricCell label="Monthly Revenue" value="$42,000" copper />
                <MetricCell label="Annual Revenue" value="$504,000" />
                <MetricCell label="Total Users" value="3,200" />
                <MetricCell label="MoM Growth" value="14%" />
              </div>
            </GateBlur>
          )
        )}

        {/* ── Related startups ── */}
        {relatedStartups.length > 0 && (
          <section style={{ marginTop: "64px", paddingTop: "32px", borderTop: "1px solid var(--cr-rule)" }}>
            <div className="ruled-label" style={{ marginBottom: "20px" }}>Similar startups</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "14px" }}>
              {relatedStartups.map((s) => (
                <StartupCard key={s.id} startup={s as any} investorTier={null} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Message dialog ── */}
      {messageOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,22,18,0.55)", padding: "16px" }}>
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "28px", width: "100%", maxWidth: "440px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "20px", color: "var(--cr-ink)" }}>Express Interest</h3>
              <button onClick={() => setMessageOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", marginBottom: "16px" }}>
              Send {startup.name} a message to start the conversation.
            </p>
            <textarea
              style={{ width: "100%", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink)", padding: "12px 14px", resize: "none", minHeight: "110px", outline: "none", boxSizing: "border-box" }}
              placeholder={`Hi ${startup.name} team, I'm interested in your funding round…`}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              onFocus={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
              onBlur={e   => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button onClick={() => setMessageOpen(false)}
                style={{ flex: 1, height: "44px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
                {t("common.cancel")}
              </button>
              <button onClick={sendMessage} disabled={sendingMessage || !messageBody.trim()}
                className="btn-copper-shimmer"
                style={{ flex: 1, height: "44px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#fff", cursor: "pointer", opacity: sendingMessage || !messageBody.trim() ? 0.5 : 1 }}>
                {sendingMessage ? t("common.saving") : t("toast.messageSent")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
