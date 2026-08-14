"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { StartupCard } from "./startup-card";
import { Globe, Share2, Eye, FileText, MessageSquare, Brain, Lock, ExternalLink, ChevronLeft, Bookmark, X, Handshake, CalendarClock } from "lucide-react";
import {
  formatCurrency, formatNumber, formatDate, formatPercent,
  STAGE_LABELS, getInitials,
} from "@/lib/utils";
import { investorCan } from "@/lib/access";
import { AiReportDisclaimer } from "@/components/shared/legal-disclaimer";
import { GateBlur } from "@/components/ui/GateBlur";
import type { Startup, SubscriptionTier } from "@/types";
import { safeFormatMRR, safeFormatCurrencyAmount } from "@/lib/validators";
import type { StartupCardData } from "@/components/startup/startup-card";
import { notify } from "@/components/ui/toast-notify";
import { useRouter } from "next/navigation";
import { PrintButton } from "@/components/ui/PrintButton";
import { PrintHeader } from "@/components/ui/PrintHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { StickyActionBar } from "@/components/shared/sticky-action-bar";
import { roundCloseState } from "@/lib/round-close";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  startup:        Startup;
  investorTier:   SubscriptionTier | null;
  investorId:     string | null;
  /** The viewer's own deal with this startup, if one exists. Never anyone else's. */
  viewerDeal:     { id: string; status: string } | null;
  ndaSigned:      boolean;
  relatedStartups: StartupCardData[];
  updates?: Array<{ id: string; title: string; body: string; created_at: string }>;
  isOwner?: boolean;
  questions?: Array<{ id: string; question: string; answer: string | null; answered_at: string | null; created_at: string }>;
  isLaunchMode:   boolean;
  viewerSuspended?: boolean;
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

/**
 * Send this listing to another investor on the platform (deal_shared
 * notification). Typeahead over /api/search, investors only.
 */
function SharePicker({ startupId }: { startupId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ id?: string; slug: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const j = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })).json();
        setHits((j.investors ?? []).slice(0, 5));
      } catch { /* aborted */ }
    }, 200);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q, open]);

  async function share(inv: { slug: string; name: string; id?: string }) {
    setBusy(true);
    // /api/search returns slugs; resolve the id through the share API by slug?
    // The share route wants an id -- fetch it from the public directory row.
    let invId = inv.id;
    if (!invId) {
      const { createClient } = await import("@/lib/supabase");
      const { data } = await createClient().from("investors").select("id").eq("slug", inv.slug).maybeSingle();
      invId = data?.id;
    }
    const res = invId ? await fetch("/api/deals/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId, toInvestorId: invId }) }) : null;
    setBusy(false);
    if (res?.ok) { notify.success(t("startupDetail.shared", { name: inv.name })); setOpen(false); setQ(""); }
    else notify.error(t("errors.generic"));
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", padding: "8px 14px", cursor: "pointer" }}>
        <Share2 style={{ width: 13, height: 13 }} /> {t("startupDetail.shareWith")}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "260px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "0 8px 24px rgba(26,22,18,0.12)", padding: "10px", zIndex: 55 }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t("startupDetail.shareSearchPh")}
            style={{ width: "100%", boxSizing: "border-box", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink)", padding: "8px 10px", outline: "none" }} />
          <div style={{ marginTop: hits.length ? "8px" : 0, display: "flex", flexDirection: "column" }}>
            {hits.map(h => (
              <button key={h.slug} disabled={busy} onClick={() => share(h)}
                style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)", padding: "7px 6px", borderRadius: "3px" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--cr-paper-3)")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                {h.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The watchlist note, editable where the thought occurs. Loads the existing
 * note via the caller's own RLS row; saves through the watchlist API's
 * note-preserving upsert.
 */
function InlineWatchNote({ startupId }: { startupId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { createClient } = await import("@/lib/supabase");
      const { data } = await createClient().from("watchlists").select("note").eq("startup_id", startupId).maybeSingle();
      setNote(data?.note ?? "");
    })();
  }, [startupId]);

  if (note === null) return null;

  return (
    <div style={{ marginTop: "10px" }}>
      {!open ? (
        <button onClick={() => setOpen(true)}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "underline", textUnderlineOffset: "3px", padding: 0 }}>
          {note ? t("startupDetail.editNote") : t("startupDetail.addNote")}
        </button>
      ) : (
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", maxWidth: "480px" }}>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} placeholder={t("startupDetail.notePh")}
            style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink)", padding: "8px 10px", outline: "none", resize: "vertical" }} />
          <button disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId, note }) });
              setBusy(false);
              if (res.ok) { notify.success(t("toast.saved")); setOpen(false); }
              else notify.error(t("errors.generic"));
            }}
            style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "8px 12px", cursor: "pointer" }}>
            {busy ? "…" : t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}

function DocRequestRow({ startupId }: { startupId: string }) {
  const { t } = useTranslation();
  const [docType, setDocType] = useState("pitch_deck");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (sent) return <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-up)", marginTop: "14px" }}>{t("startupDetail.reqSent")}</p>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "16px" }}>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-4)" }}>{t("startupDetail.requestDoc")}:</span>
      <select value={docType} onChange={e => setDocType(e.target.value)}
        style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink)", padding: "7px 10px", outline: "none" }}>
        <option value="pitch_deck">Pitch deck</option>
        <option value="financial_model">Financial model</option>
        <option value="cap_table">Cap table</option>
        <option value="other">Other</option>
      </select>
      <button disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/documents/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId, docType }) });
          setBusy(false);
          if (res.ok) { setSent(true); notify.success(t("startupDetail.reqSent")); }
          else notify.error(t("errors.generic"));
        }}
        style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "7px 12px", cursor: "pointer" }}>
        {busy ? "…" : t("startupDetail.askSend")}
      </button>
    </div>
  );
}

function QAAskBox({ startupId }: { startupId: string }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (sent) return <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-up)" }}>{t("startupDetail.questionSent")}</p>;
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
      <textarea value={q} onChange={e => setQ(e.target.value)} rows={2} maxLength={1000} placeholder={t("startupDetail.questionPh")}
        style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "10px 12px", outline: "none", resize: "vertical" }} />
      <button disabled={busy || q.trim().length < 10}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId, question: q }) });
          setBusy(false);
          if (res.ok) { setSent(true); notify.success(t("startupDetail.questionSent")); }
          else notify.error(t("errors.generic"));
        }}
        style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "9px 14px", cursor: "pointer", opacity: q.trim().length < 10 ? 0.5 : 1, whiteSpace: "nowrap" }}>
        {busy ? "…" : t("startupDetail.askSend")}
      </button>
    </div>
  );
}

function QAAnswerBox({ questionId }: { questionId: string }) {
  const { t } = useTranslation();
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-up)" }}>{t("startupDetail.answered")}</p>;
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
      <textarea value={a} onChange={e => setA(e.target.value)} rows={2} maxLength={3000} placeholder={t("startupDetail.answerPh")}
        style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "10px 12px", outline: "none", resize: "vertical" }} />
      <button disabled={busy || !a.trim()}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/questions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: questionId, answer: a }) });
          setBusy(false);
          if (res.ok) { setDone(true); notify.success(t("startupDetail.answered")); }
          else notify.error(t("errors.generic"));
        }}
        style={{ border: "none", background: "var(--cr-copper)", color: "#fff", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", padding: "9px 14px", cursor: "pointer", opacity: !a.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
        {busy ? "…" : t("startupDetail.answerSend")}
      </button>
    </div>
  );
}

export function StartupDetailClient({
  startup, investorTier, investorId, viewerDeal, ndaSigned, relatedStartups, updates = [], questions = [], isOwner = false, isLaunchMode, viewerSuspended = false,
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

  const accessCtx = { userId: investorId, role: investorId ? "investor" as const : null, tier: investorTier, isLaunchMode, suspended: viewerSuspended };
  const caps          = investorCan(accessCtx);
  const canFinancials = caps.viewFinancials;
  const canMessage    = caps.message;
  const canAi         = caps.aiDiligence === "included";
  const canDocuments  = caps.viewDocuments;
  const canTeam       = caps.viewTeam;

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

  const router = useRouter();
  const [startingDeal, setStartingDeal] = useState(false);
  // Inline PDF viewer: keep the reader on the page instead of a new tab.
  const [viewerDoc, setViewerDoc] = useState<{ url: string; label: string } | null>(null);
  // Best-effort view logging (migration 039); founders see the aggregate.
  function trackDoc(documentId: string) {
    fetch("/api/documents/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId }) }).catch(() => {});
  }
  // The reverse of the pipeline pill: when there is no deal yet, the profile
  // is where an investor decides to start one -- sending them to the portal
  // to re-find this startup by name was the long way round.
  async function startDeal() {
    if (!investorId || startingDeal) return;
    setStartingDeal(true);
    const res = await fetch("/api/deals/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterpartId: startup.id }),
    });
    const data = await res.json();
    setStartingDeal(false);
    if (!res.ok) { notify.error(data.error || t("errors.generic")); return; }
    router.push(`/deals?deal=${data.deal.id}`);
  }


  async function toggleSave() {
    if (!investorId) { notify.info(t("startupDetail.signInToSave")); return; }
    if (isSaved) {
      await supabase.from("watchlists").delete().match({ investor_id: investorId, startup_id: startup.id });
      setIsSaved(false);
      notify.info(t("toast.unsaved"));
    } else {
      await supabase.from("watchlists").insert({ investor_id: investorId, startup_id: startup.id });
      setIsSaved(true);
      notify.success(t("toast.saved"));
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
      notify.success(t("toast.messageSent"));
    } else {
      const err = await res.json();
      notify.error(err.error || t("startupDetail.failedSendMessage"));
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
    if (res.ok) notify.success(t("startupDetail.ndaSent"));
    else notify.error(t("startupDetail.failedSendNda"));
  }

  const { t } = useTranslation();
  const score = startup.vaultrise_score ?? null;

  const TAB_LABELS: Record<Tab, string> = {
    overview:   t("startupDetail.overview"),
    team:       t("startupDetail.team"),
    financials: t("startupDetail.financials"),
    documents:  t("startupDetail.documents"),
    traction:   t("startupDetail.traction"),
  };

  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>
      <PrintHeader title={startup.name} tagline={t("common.printTagline")} />

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
                  {viewerDeal && (
                    // The profile and the Deal Portal previously didn't know
                    // about each other: an investor could be mid-diligence on
                    // a startup and its profile gave no hint. Links into the
                    // pipeline rather than restating deal details here.
                    <Link
                      href="/deals"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "5px",
                        background: viewerDeal.status === "closed" ? "var(--cr-up-bg, var(--cr-copper-bg))" : "var(--cr-copper-bg)",
                        border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)",
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px",
                        borderRadius: "3px", padding: "3px 9px",
                        textTransform: "uppercase", letterSpacing: "0.05em", textDecoration: "none",
                      }}
                    >
                      <Handshake style={{ width: 11, height: 11 }} />
                      {t("startupDetail.inYourPipeline")}{" — "}
                      {viewerDeal.status === "intro" ? t("deals.colIntro")
                        : viewerDeal.status === "due_diligence" ? t("dashboard.dueDiligence")
                        : viewerDeal.status === "term_sheet" ? t("deals.colTermSheet")
                        : viewerDeal.status === "closed" ? t("deals.colClosed")
                        : t("deals.colPassed")}
                    </Link>
                  )}
                  {!viewerDeal && investorId && !viewerSuspended && (
                    <button
                      onClick={startDeal}
                      disabled={startingDeal}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "5px",
                        background: "transparent", border: "1px solid var(--cr-copper-br)",
                        color: "var(--cr-copper)", cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px",
                        borderRadius: "2px", padding: "3px 9px",
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        opacity: startingDeal ? 0.5 : 1,
                      }}
                    >
                      <Handshake style={{ width: 11, height: 11 }} />
                      {startingDeal ? t("deals.creating") : t("startupDetail.startDeal")}
                    </button>
                  )}
                  <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {startup.industry}
                  </span>
                  <span style={{ background: "var(--cr-paper-4)", border: "1px solid var(--cr-rule)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", borderRadius: "3px", padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {STAGE_LABELS[startup.stage] ?? startup.stage}
                  </span>
                  {/* Same model as the browse card (lib/round-close), so the
                      two surfaces cannot disagree about "closing soon". */}
                  {(() => {
                    const closing = roundCloseState(startup.round_close_date);
                    if (!closing) return null;
                    return (
                      <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", borderRadius: "3px", padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {closing.kind === "closingSoon" ? t("startup.closingSoon") : t("startup.closesIn", { count: closing.days })}
                      </span>
                    );
                  })()}
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
              {(startup.looking_for?.length || startup.social_proof?.length || startup.languages?.length) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {(startup.looking_for as string[] | null)?.map((item: string) => (
                    <span key={item} style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-2)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", borderRadius: "3px", padding: "3px 8px" }}>
                      {item}
                    </span>
                  ))}
                  {(startup.social_proof as Array<{ type: string; value: string }> | null)?.map((sp, i) => (
                    <span key={i} style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", borderRadius: "3px", padding: "3px 8px" }}>
                      {sp.value}
                    </span>
                  ))}
                  {(startup.deck_language && startup.deck_language !== "English") && (
                    <span style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", borderRadius: "3px", padding: "3px 8px" }}>
                      Deck: {startup.deck_language}
                    </span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                {startup.booking_url && (
                  <a href={startup.booking_url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-copper-br)", background: "var(--cr-copper-bg)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)", padding: "8px 14px", textDecoration: "none" }}>
                    <CalendarClock style={{ width: 13, height: 13 }} /> {t("startupDetail.bookCall")}
                  </a>
                )}
                {startup.website && (
                  <a href={startup.website} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", padding: "8px 14px", textDecoration: "none", cursor: "pointer" }}>
                    <Globe style={{ width: 13, height: 13 }} /> {t("startupDetail.website")}
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
                {investorId && !viewerSuspended && <SharePicker startupId={startup.id} />}
                <PrintButton label={t("startupDetail.aiDiligenceTitle")} />
                {isSaved && investorId && <InlineWatchNote startupId={startup.id} />}
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
              <MetricCell label={t("startupDetail.raising")}  value={safeFormatCurrencyAmount(startup.funding_target)} copper />
              <MetricCell label={t("startupDetail.equity")}   value={startup.equity_offered != null ? `${startup.equity_offered}%` : null} />
              <MetricCell label={t("startupDetail.minCheck")} value={startup.min_check_size ? formatCurrency(startup.min_check_size, true) : "Open"} />
              <MetricCell label={t("startupDetail.pageViews")} value={formatNumber(startup.pageviews ?? 0)} />
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
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "2px" }}>{t("startupDetail.aiDiligenceTitle")}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("ai.diligence.generate")}</p>
              </div>
            </div>
            <button onClick={generateAiReport} disabled={generatingReport}
              style={{ background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "8px 20px", cursor: "pointer", whiteSpace: "nowrap", opacity: generatingReport ? 0.6 : 1 }}>
              {generatingReport ? t("startupDetail.generating") : t("startupDetail.generateReport")}
            </button>
          </div>
        )}

        {aiReport && (
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "24px", marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Brain style={{ width: 16, height: 16, color: "var(--cr-copper)" }} />
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>{t("startupDetail.aiDiligenceTitle")}</h3>
              <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Claude</span>
            </div>
            <AiReportDisclaimer />
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
            {startup.problem             && <Section title={t("startupDetail.problem")}>{startup.problem}</Section>}
            {startup.solution            && <Section title={t("startupDetail.solution")}>{startup.solution}</Section>}
            {startup.market              && <Section title={t("startupDetail.market")}>{startup.market}</Section>}
            {startup.competitive_advantage && <Section title={t("startupDetail.competitiveAdvantage")}>{startup.competitive_advantage}</Section>}
            {startup.use_of_funds        && <Section title={t("startupDetail.useOfFunds")}>{startup.use_of_funds}</Section>}

            {/* Milestones */}
            {startup.milestones && startup.milestones.length > 0 && (
              <div>
                <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("startupDetail.milestones")}</div>
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
            {startup.video_pitch_url && (
              <div>
                <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("startupDetail.pitchVideo")}</div>
                <div style={{ aspectRatio: "16/9", borderRadius: "6px", overflow: "hidden", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)" }}>
                  <iframe
                    src={(startup.video_pitch_url as string)
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
            {startup.demo_video_url && startup.subscription_tier === "growth" && (
              <div>
                <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("startupDetail.productDemo")}</div>
                {canFinancials ? (
                  <div style={{ aspectRatio: "16/9", borderRadius: "4px", overflow: "hidden", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)" }}>
                    <iframe
                      src={startup.demo_video_url
                        .replace("watch?v=", "embed/")
                        .replace("youtu.be/", "youtube.com/embed/")}
                      style={{ width: "100%", height: "100%" }}
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div style={{ aspectRatio: "16/9", borderRadius: "4px", background: "var(--cr-paper-3)", border: "1px dashed var(--cr-paper-4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                    <Lock style={{ width: 24, height: 24, color: "var(--cr-ink-4)" }} />
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)" }}>{t("startupDetail.upgradeWatchDemo")}</p>
                    <Link href="/pricing" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>{t("dashboard.viewPlans")} →</Link>
                  </div>
                )}
              </div>
            )}
            {/* ── Updates feed ── */}
            {updates.length > 0 && (
              <div style={{ marginTop: "32px" }}>
                <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("startupDetail.updates")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {updates.map((u) => (
                    <div key={u.id} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", marginBottom: "6px" }}>
                        <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{u.title}</h4>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                          {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{u.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Q&A ── */}
            {(questions.length > 0 || (investorId && !viewerSuspended)) && (
              <div style={{ marginTop: "32px" }}>
                <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("startupDetail.qa")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {questions.map((q) => (
                    <div key={q.id} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "14px 18px" }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", marginBottom: q.answer ? "8px" : 0 }}>
                        <span style={{ color: "var(--cr-copper)", fontWeight: 700 }}>Q&nbsp;</span>{q.question}
                      </p>
                      {q.answer ? (
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          <span style={{ color: "var(--cr-up)", fontWeight: 700 }}>A&nbsp;</span>{q.answer}
                        </p>
                      ) : isOwner ? (
                        <QAAnswerBox questionId={q.id} />
                      ) : (
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", fontStyle: "italic" }}>—</p>
                      )}
                    </div>
                  ))}
                  {investorId && !viewerSuspended && <QAAskBox startupId={startup.id} />}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Team ── */}
        {activeTab === "team" && !canTeam && startup.founders && startup.founders.length > 0 && (
          <GateBlur
            title={t("startupDetail.angelTierRequired")}
            description={t("startupDetail.upgradeFinancialsDesc")}
            ctaLabel={t("dashboard.viewPlans")}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
              {startup.founders.slice(0, 2).map((f) => (
                <div key={f.id} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "4px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", marginBottom: "14px" }} />
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>Founder name</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>Role</p>
                </div>
              ))}
            </div>
          </GateBlur>
        )}

        {activeTab === "team" && canTeam && (
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
                  {f.bio && (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.65, marginBottom: "14px" }}>{f.bio}</p>
                  )}
                  <div style={{ display: "flex", gap: "14px" }}>
                    {f.linkedin_url && (
                      <a href={f.linkedin_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>LinkedIn</a>
                    )}
                    {f.twitter_url && (
                      <a href={f.twitter_url.startsWith("http") ? f.twitter_url : `https://x.com/${f.twitter_url.replace("@", "")}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>X / Twitter</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>{t("startupDetail.noTeamInfo")}</p>
          )
        )}

        {/* ── Tab: Financials ── */}
        {activeTab === "financials" && (
          canFinancials ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
              <MetricCell label={t("startupDetail.mrr")}    value={startup.mrr         ? safeFormatMRR(startup.mrr)        : null} />
              <MetricCell label={t("startupDetail.arr")}    value={startup.arr         ? safeFormatMRR(startup.arr)        : null} />
              <MetricCell label={t("startupDetail.totalUsers")} value={startup.user_count  ? formatNumber(startup.user_count)   : null} />
              <MetricCell label={t("startupDetail.growth")} value={startup.growth_rate  ? formatPercent(startup.growth_rate) : null} />
            </div>
          ) : (
            <GateBlur
              title={t("startupDetail.angelTierRequired")}
              description={t("startupDetail.upgradeFinancialsDesc")}
              ctaLabel={t("dashboard.viewPlans")}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                <MetricCell label={t("startupDetail.mrr")} value="$42,000" />
                <MetricCell label={t("startupDetail.arr")} value="$504,000" />
                <MetricCell label={t("startupDetail.totalUsers")} value="3,200" />
                <MetricCell label={t("startupDetail.growth")} value="14%" />
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
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "12px" }}>{t("startupDetail.signUpPitchDeck")}</p>
                  <Link href="/auth/signup" style={{ background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "9px 22px", borderRadius: "4px", textDecoration: "none" }}>
                    {t("startupDetail.createFreeAccount")} →
                  </Link>
                </div>
              </div>
            )}

            {startup.documents && startup.documents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {startup.documents.map((doc) => {
                  const requiresUpgrade = !canDocuments;
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
                          {ndaLoading ? t("common.saving") : t("startupDetail.signNdaAccess")}
                        </button>
                      ) : requiresUpgrade ? (
                        <Link href="/pricing" style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", padding: "7px 14px", textDecoration: "none" }}>
                          <Lock style={{ width: 11, height: 11 }} /> {t("common.upgrade")}
                        </Link>
                      ) : (
                        /\.pdf(\?|$)/i.test(doc.file_url) ? (
                          <button onClick={() => { trackDoc(doc.id); setViewerDoc({ url: doc.file_url, label: doc.label }); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "#fff", padding: "7px 14px", cursor: "pointer" }}>
                            <Eye style={{ width: 11, height: 11 }} /> {t("common.view")}
                          </button>
                        ) : (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" onClick={() => trackDoc(doc.id)}
                          style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "#fff", padding: "7px 14px", textDecoration: "none" }}>
                          <ExternalLink style={{ width: 11, height: 11 }} /> {t("common.view")}
                        </a>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>{t("startupDetail.noDocumentsUploaded")}</p>
            )}
            {investorId && !viewerSuspended && <DocRequestRow startupId={startup.id} />}
          </>
        )}

        {viewerDoc && (
          <div style={{ position: "fixed", inset: 0, zIndex: 80 }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(26,22,18,0.6)" }} onClick={() => setViewerDoc(null)} />
            <div style={{ position: "absolute", top: "4vh", left: "50%", transform: "translateX(-50%)", width: "min(94vw, 900px)", height: "92vh", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--cr-rule-dark)", flexShrink: 0 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{viewerDoc.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <a href={viewerDoc.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                    {t("startupDetail.openNewTab")}
                  </a>
                  <button onClick={() => setViewerDoc(null)} aria-label={t("nav.closeMenu")}
                    style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", display: "flex" }}>
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
              <iframe src={viewerDoc.url} title={viewerDoc.label} style={{ flex: 1, border: "none", width: "100%" }} />
            </div>
          </div>
        )}

        {/* ── Tab: Traction ── */}
        {activeTab === "traction" && (
          canFinancials ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
              <MetricCell label={t("startupDetail.monthlyRevenue")} value={startup.mrr        ? safeFormatMRR(startup.mrr)        : null} copper />
              <MetricCell label={t("startupDetail.annualRevenue")}  value={startup.arr        ? safeFormatMRR(startup.arr)        : null} />
              <MetricCell label={t("startupDetail.totalUsers")}     value={startup.user_count ? formatNumber(startup.user_count)   : null} />
              <MetricCell label={t("startupDetail.momGrowth")}      value={startup.growth_rate ? formatPercent(startup.growth_rate) : null} />
            </div>
          ) : (
            <GateBlur
              title={t("startupDetail.upgradeTractionTitle")}
              description={t("startupDetail.upgradeTractionDesc")}
              ctaLabel={t("dashboard.viewPlans")}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                <MetricCell label={t("startupDetail.monthlyRevenue")} value="$42,000" copper />
                <MetricCell label={t("startupDetail.annualRevenue")} value="$504,000" />
                <MetricCell label={t("startupDetail.totalUsers")} value="3,200" />
                <MetricCell label={t("startupDetail.momGrowth")} value="14%" />
              </div>
            </GateBlur>
          )
        )}

        {/* ── Related startups ── */}
        {relatedStartups.length > 0 && (
          <section style={{ marginTop: "64px", paddingTop: "32px", borderTop: "1px solid var(--cr-rule)" }}>
            <div className="ruled-label" style={{ marginBottom: "20px" }}>{t("startupDetail.similarStartups")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "14px" }}>
              {relatedStartups.map((s) => (
                <StartupCard key={s.id} startup={s} investorTier={null} />
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
              <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "20px", color: "var(--cr-ink)" }}>{t("startupDetail.expressInterest")}</h3>
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

      {/* The header's eight-button action row wraps into a block on a phone and
          is gone the moment you scroll to the traction. These three follow you
          down. Deliberately not the full set -- a sticky bar that carries
          everything is just the same block pinned to the bottom. */}
      <StickyActionBar>
        <button
          onClick={toggleSave}
          aria-pressed={isSaved}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
            height: "44px", paddingInline: "14px", flexShrink: 0,
            border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)", borderRadius: "4px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
            color: isSaved ? "var(--cr-copper)" : "var(--cr-ink-3)", cursor: "pointer",
          }}
        >
          <Bookmark style={{ width: 15, height: 15, fill: isSaved ? "var(--cr-copper)" : "transparent" }} />
          <span className="sr-only">{isSaved ? t("toast.saved") : t("common.saveWatchlist")}</span>
        </button>

        {!viewerDeal && investorId && !viewerSuspended && (
          <button
            onClick={startDeal}
            disabled={startingDeal}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
              height: "44px", paddingInline: "14px", flexShrink: 0,
              border: "1px solid var(--cr-copper-br)", background: "var(--cr-copper-bg)", borderRadius: "4px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
              color: "var(--cr-copper)", cursor: "pointer", opacity: startingDeal ? 0.5 : 1,
            }}
          >
            <Handshake style={{ width: 15, height: 15 }} />
            {startingDeal ? t("deals.creating") : t("startupDetail.startDeal")}
          </button>
        )}

        {canMessage ? (
          <button
            onClick={() => setMessageOpen(true)}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
              height: "44px", minWidth: 0,
              background: "var(--cr-copper)", border: "1px solid var(--cr-copper-d)", borderRadius: "4px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#fff", cursor: "pointer",
            }}
          >
            <MessageSquare style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t("startupDetail.requestIntro")}
            </span>
          </button>
        ) : (
          <Link
            href="/pricing"
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
              height: "44px", minWidth: 0,
              background: "var(--cr-copper)", border: "1px solid var(--cr-copper-d)", borderRadius: "4px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#fff", textDecoration: "none",
            }}
          >
            <Lock style={{ width: 15, height: 15, flexShrink: 0 }} />
            {t("common.upgrade")}
          </Link>
        )}
      </StickyActionBar>
    </main>
  );
}
