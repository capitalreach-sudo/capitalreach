"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { OfferButton } from "@/components/startup/offer-button";
import { countryLabel } from "@/lib/country-label";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { StartupCard } from "./startup-card";
import { Globe, Eye, FileText, MessageSquare, Brain, Lock, ExternalLink, ChevronLeft, Bookmark, X, Handshake, CalendarClock, BadgeCheck, MoreHorizontal } from "lucide-react";
import {
  formatCurrency, formatNumber, formatDate, formatPercent,
  STAGE_LABELS, getInitials,
} from "@/lib/utils";
import { investorCan } from "@/lib/access";
import { getInvestorPlan } from "@/lib/plans";
import { AiReportDisclaimer } from "@/components/shared/legal-disclaimer";
import { GateBlur } from "@/components/ui/GateBlur";
import type { Startup, SubscriptionTier } from "@/types";
import { safeFormatMRR, safeFormatCurrencyAmount } from "@/lib/validators";
import type { StartupCardData } from "@/components/startup/startup-card";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { NdaAgreementDialog } from "@/components/startup/nda-agreement-dialog";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { notify } from "@/components/ui/toast-notify";
import { useRefusal } from "@/hooks/useRefusal";
import { useRouter } from "next/navigation";
import { PrintHeader } from "@/components/ui/PrintHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { ScoreDial } from "@/components/ui/score-dial";
import { InfoTip } from "@/components/shared/info-tip";
import { TranslatedContent, T } from "@/components/shared/translated-content";
import { track } from "@/lib/track";
import { StickyActionBar } from "@/components/shared/sticky-action-bar";
import { EntityLogo } from "@/components/shared/entity-logo";
import { WaitlistButton } from "@/components/startup/waitlist-button";
import { FounderToFounder } from "@/components/startup/founder-to-founder";
import { DemoBadge } from "@/components/shared/demo-badge";
import { RiskWarning } from "@/components/startup/risk-warning";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { TrustPanel, trustBadgeVisible } from "@/components/shared/trust-panel";
import { InterestedButton } from "@/components/shared/interested-button";
import { RoundCalculator } from "@/components/startup/round-calculator";
import { roundCloseState } from "@/lib/round-close";
import { SCORECARD_CRITERIA, CRITERION_LABEL_KEY, scorecardTotal, type ScorecardScores, type ScorecardWeights, type ScorecardCriterion } from "@/lib/scorecard";
import { postMoney, preMoney, impliedDilutionPct, ownershipForCheque, impliedPostFromEquity, equityValuationMismatch, type ValuationType } from "@/lib/round-math";
import { TractionChart, type MetricPoint } from "@/components/startup/traction-chart";
import { NonCircumventionModal } from "@/components/ui/NonCircumventionModal";
import { FeeCalculator } from "@/components/ui/FeeCalculator";

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
  viewerStartupId?: string | null;
  questions?: Array<{ id: string; question: string; answer: string | null; answered_at: string | null; created_at: string; is_private?: boolean; asker?: { slug: string; name: string | null } | null }>;
  isLaunchMode:   boolean;
  /** The signed-in user, if any. What launch mode keys its promotion on -- a
   *  founder has no investor row and must not read as anonymous. */
  viewerUserId?:  string | null;
  /** Owner is looking at their own listing as a free investor would see it. */
  previewing?:    boolean;
  /** Admins bypass every viewer gate (never while previewing). */
  viewerIsAdmin?: boolean;
  /** Monthly snapshots; server sends them only when this viewer may see them. */
  metricHistory?: MetricPoint[];
  viewerSuspended?: boolean;
  /** Founder full names + social links are visible (owner/admin/deal). */
  identityRevealed?: boolean;
  /** This investor has already accepted the non-circumvention terms here. */
  circumventionAcked?: boolean;
  /** C33: other investors who opted in to being visible here. */
  coInvestors?: Array<{ slug: string; name: string | null; type: string | null }>;
  /** B19: public momentum aggregate (only when the founder opted in). */
  momentum?: { interested: number; committedCount: number; committedAmount: number; softAmount: number; currency: string } | null;
  /** A verification_cases row is open for this listing. Server-supplied only:
      the badge never guesses that a silent listing is "pending". */
  verificationCaseOpen?: boolean;
  /** Auto-translation: the listing's detected language, a server-cached
      translation for the viewer's locale (if any), and whether translation is
      configured on the server. */
  sourceLocale?: string | null;
  initialTranslation?: Record<string, string> | null;
  translationAvailable?: boolean;
}

const TABS = ["overview", "team", "financials", "documents", "traction"] as const;
type Tab = typeof TABS[number];

// ── Action-row treatments ─────────────────────────────────────────────────────

/**
 * Every non-primary control on the listing's action row wears this. The one
 * primary is the offer -- contact opens on an accepted offer and nothing else,
 * so the copper pill belongs to it alone; components/startup/offer-button.tsx
 * owns that fill. These sit four pixels shorter than it, so the rank is
 * legible before a single label has been read.
 */
const QUIET_ACTION: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
  minHeight: "36px", paddingInline: "16px",
  background: "transparent", border: "1px solid var(--cr-paper-4)", borderRadius: "999px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
  color: "var(--cr-ink-2)", textDecoration: "none", cursor: "pointer",
  // A wrapped button label reads as a rendering fault, not a choice.
  whiteSpace: "nowrap",
};

const MENU_ITEM: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
  width: "100%", textAlign: "start",
  background: "none", border: "none", borderRadius: "3px", cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
  color: "var(--cr-ink-2)", padding: "8px 10px", textDecoration: "none",
};

const MENU_LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px",
  color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em",
  padding: "8px 10px 4px",
};

const MENU_RULE: CSSProperties = { display: "block", height: "1px", background: "var(--cr-rule)", margin: "4px 0" };

/** The overflow panel's width, in px. Shared with the open handler, which
 *  needs it to work out where the panel can sit without leaving the viewport
 *  -- the row wraps, so the trigger's position is not knowable from CSS. */
const MENU_WIDTH = 240;

const menuHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = "var(--cr-paper-3)"; },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = "none"; },
};

// ── Section text block ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="ruled-label" style={{ marginBottom: "12px" }}>{title}</h3>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.7 }}>{children}</p>
    </div>
  );
}

// ── Metric cell ───────────────────────────────────────────────────────────────

/**
 * One column of the header's metrics strip. The cell carries only its right
 * and bottom hairlines; the strip container supplies the top and left, so the
 * four cells close into a single ruled block at any column count the
 * breakpoint chooses -- 2 up on a phone, 4 across on a desk. A tinted,
 * rounded, bordered tile per number would be four boxes inside the page's
 * own frame, which the house reads as card-in-card.
 */
function MetricCell({ label, value, copper, termKey }: { label: string; value: string | null; copper?: boolean; termKey?: string }) {
  return (
    <div style={{ borderRight: "1px solid var(--cr-rule)", borderBottom: "1px solid var(--cr-rule)", padding: "12px 16px", minWidth: 0 }}>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>
        {label}
        {termKey && <InfoTip termKey={termKey} />}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "20px", color: copper ? "var(--cr-copper)" : value ? "var(--cr-ink)" : "var(--cr-ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Send this listing to another investor on the platform (deal_shared
 * notification). Typeahead over /api/search, investors only.
 *
 * A pane rather than its own popover: it is one entry inside the listing's
 * overflow menu, and a dropdown opening out of a dropdown is a stack neither
 * the keyboard nor a narrow viewport can follow.
 */
function SharePickerPanel({ startupId, onBack, onDone }: { startupId: string; onBack: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { notifyRefusal } = useRefusal();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ id?: string; slug: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [shareNote, setShareNote] = useState("");

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const j = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })).json();
        setHits((j.investors ?? []).slice(0, 5));
      } catch { /* aborted */ }
    }, 200);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q]);

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
    // C31: the note travels — it becomes the first message of the thread the
    // share opens, so "look at this" has somewhere to continue.
    const res = invId ? await fetch("/api/deals/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId, toInvestorId: invId, note: shareNote.trim() || undefined }) }) : null;
    setBusy(false);
    // No id means the directory row never resolved, so no request was made and
    // there is no server answer to read.
    if (!res) { notify.error(t("errors.generic")); return; }
    if (!res.ok) { notifyRefusal(res, await res.json().catch(() => ({}))); return; }
    notify.success(t("startupDetail.shared", { name: inv.name })); setQ(""); setShareNote(""); onDone();
  }

  return (
    <div style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}>
      <button onClick={onBack}
        style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", padding: "2px 0 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-4)" }}>
        <ChevronLeft style={{ width: 13, height: 13 }} /> {t("common.back")}
      </button>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t("startupDetail.shareSearchPh")}
        style={{ width: "100%", boxSizing: "border-box", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink)", padding: "8px 10px", outline: "none" }} />
      <textarea value={shareNote} onChange={e => setShareNote(e.target.value.slice(0, 2000))} rows={2} placeholder={t("startupDetail.shareNotePh")}
        style={{ width: "100%", boxSizing: "border-box", marginTop: "6px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink)", padding: "7px 10px", outline: "none", resize: "vertical" }} />
      <div style={{ marginTop: hits.length ? "8px" : 0, display: "flex", flexDirection: "column" }}>
        {hits.map(h => (
          <button key={h.slug} disabled={busy} onClick={() => share(h)}
            style={{ textAlign: "start", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)", padding: "7px 6px", borderRadius: "3px" }}
            {...menuHover}>
            {h.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Click-to-play video facade. An iframe swallows every click, so bare embeds
 * made play-counts impossible AND shipped the whole player to people who never
 * pressed play. The facade tracks the play (migration 107) and only then
 * mounts the player, autoplaying so the click means what the viewer meant.
 */
function TrackedVideo({ startupId, url }: { startupId: string; url: string }) {
  const [playing, setPlaying] = useState(false);
  const src = url
    .replace("watch?v=", "embed/")
    .replace("youtu.be/", "youtube.com/embed/")
    .replace("loom.com/share/", "loom.com/embed/");
  if (playing) {
    return (
      <iframe
        src={src + (src.includes("?") ? "&" : "?") + "autoplay=1"}
        style={{ width: "100%", height: "100%", border: "none" }}
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    );
  }
  return (
    <button
      onClick={() => { track("startup", startupId, "video_play"); setPlaying(true); }}
      aria-label="Play video"
      style={{ width: "100%", height: "100%", border: "none", cursor: "pointer", background: "var(--cr-band-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <span style={{ width: 64, height: 64, borderRadius: "50%", border: "1px solid var(--cr-copper-br)", background: "var(--cr-copper-bg)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><path d="M6 4l10 6-10 6V4z" fill="var(--cr-copper)" /></svg>
      </span>
    </button>
  );
}

/**
 * The watchlist note, editable where the thought occurs. Loads the existing
 * note via the caller's own RLS row; saves through the watchlist API's
 * note-preserving upsert.
 */
function InlineWatchNote({ startupId }: { startupId: string }) {
  const { t } = useTranslation();
  const { notifyRefusal } = useRefusal();
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

  // No margin of its own: the action row's second line owns the spacing, and
  // a component that carries both is a component that cannot be placed twice.
  return (
    <div style={{ paddingTop: "8px" }}>
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
              else notifyRefusal(res, await res.json().catch(() => ({})));
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
  const { notifyRefusal } = useRefusal();
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
          else notifyRefusal(res, await res.json().catch(() => ({})));
        }}
        style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "7px 12px", cursor: "pointer" }}>
        {busy ? "…" : t("startupDetail.askSend")}
      </button>
    </div>
  );
}

/**
 * C27: the investor's private scorecard. Five criteria, 0–5 each, weighted
 * if you care about one more than the others; the total is the average of
 * what you actually scored. Never visible to the startup — RLS scopes the
 * row to the owning investor, and it renders only for investor viewers.
 */
function ScorecardPanel({ startupId }: { startupId: string }) {
  const { t } = useTranslation();
  const { notifyRefusal } = useRefusal();
  const [scores, setScores] = useState<ScorecardScores>({});
  const [weights, setWeights] = useState<ScorecardWeights>({});
  const [note, setNote] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/scorecard?startupId=${startupId}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const sc = j?.scorecards?.[0];
        if (sc) { setScores(sc.scores ?? {}); setWeights(sc.weights ?? {}); setNote(sc.note ?? ""); setTotal(sc.total ?? null); setOpen(true); }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [startupId]);

  function persist(nextScores: ScorecardScores, nextWeights: ScorecardWeights, nextNote: string) {
    setTotal(scorecardTotal(nextScores, nextWeights));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await fetch("/api/scorecard", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId, scores: nextScores, weights: nextWeights, note: nextNote }) });
      if (!res.ok) notifyRefusal(res, await res.json().catch(() => ({})));
    }, 600);
  }
  function setScore(k: ScorecardCriterion, v: number) {
    const next = { ...scores, [k]: scores[k] === v ? undefined : v };
    if (next[k] === undefined) delete next[k];
    setScores(next); persist(next, weights, note);
  }
  function setWeight(k: ScorecardCriterion, v: number) {
    const next = { ...weights, [k]: v };
    setWeights(next); persist(scores, next, note);
  }

  if (!loaded) return null;
  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 className="ruled-label">{t("scorecard.title")}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {total != null && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "16px", color: "var(--cr-copper)" }}>{total}<span style={{ fontSize: "11px", color: "var(--cr-ink-4)" }}>/100</span></span>
          )}
          <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-3)", padding: "5px 10px", cursor: "pointer" }}>
            {open ? t("common.close") : t("scorecard.score")}
          </button>
        </div>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: 4 }}>{t("scorecard.privateHint")}</p>
      {open && (
        <div style={{ marginTop: "10px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "14px 16px" }}>
          {SCORECARD_CRITERIA.map((k) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: "10px", padding: "7px 0", borderBottom: "1px solid var(--cr-rule)" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)" }}>{t(CRITERION_LABEL_KEY[k])}</span>
              <div style={{ display: "inline-flex", gap: "4px" }} role="group" aria-label={t(CRITERION_LABEL_KEY[k])}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setScore(k, n)} aria-pressed={(scores[k] ?? 0) >= n} aria-label={`${t(CRITERION_LABEL_KEY[k])} ${n}`}
                    style={{ width: 16, height: 16, borderRadius: "3px", padding: 0, cursor: "pointer", border: `1px solid ${(scores[k] ?? 0) >= n ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`, background: (scores[k] ?? 0) >= n ? "var(--cr-copper)" : "transparent" }} />
                ))}
              </div>
              <select value={weights[k] ?? 1} onChange={(e) => setWeight(k, Number(e.target.value))} aria-label={t("scorecard.weight")} title={t("scorecard.weight")}
                style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-3)", padding: "2px 4px", cursor: "pointer" }}>
                {[0, 1, 2, 3].map((w) => <option key={w} value={w}>×{w}</option>)}
              </select>
            </div>
          ))}
          <textarea value={note} onChange={(e) => { setNote(e.target.value.slice(0, 2000)); persist(scores, weights, e.target.value.slice(0, 2000)); }}
            rows={2} placeholder={t("scorecard.notePh")}
            style={{ width: "100%", boxSizing: "border-box", marginTop: "10px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "8px 10px", outline: "none", resize: "vertical" }} />
        </div>
      )}
    </div>
  );
}

function QAAskBox({ startupId }: { startupId: string }) {
  const { t } = useTranslation();
  const { notifyRefusal } = useRefusal();
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
          else notifyRefusal(res, await res.json().catch(() => ({})));
        }}
        style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "9px 14px", cursor: "pointer", opacity: q.trim().length < 10 ? 0.5 : 1, whiteSpace: "nowrap" }}>
        {busy ? "…" : t("startupDetail.askSend")}
      </button>
    </div>
  );
}

function QAAnswerBox({ questionId }: { questionId: string }) {
  const { t } = useTranslation();
  const { notifyRefusal } = useRefusal();
  const [a, setA] = useState("");
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-up)" }}>{t("startupDetail.answered")}</p>;
  return (
    <div>
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
      <textarea value={a} onChange={e => setA(e.target.value)} rows={2} maxLength={3000} placeholder={t("startupDetail.answerPh")}
        style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "10px 12px", outline: "none", resize: "vertical" }} />
      <button disabled={busy || !a.trim()}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/questions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: questionId, answer: a, isPrivate: priv }) });
          setBusy(false);
          if (res.ok) { setDone(true); notify.success(t("startupDetail.answered")); }
          else notifyRefusal(res, await res.json().catch(() => ({})));
        }}
        style={{ border: "none", background: "var(--cr-copper)", color: "var(--cr-band-ink)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", padding: "9px 14px", cursor: "pointer", opacity: !a.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
        {busy ? "…" : t("startupDetail.answerSend")}
      </button>
    </div>
    {/* B20: private answers — the asker and you only. Public is the default,
        because answered questions are the listing's living FAQ. */}
    <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>
      <input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} style={{ accentColor: "var(--cr-copper)" }} />
      {t("startupDetail.answerPrivately")}
    </label>
    </div>
  );
}

export function StartupDetailClient({
  startup, investorTier, investorId, viewerDeal, ndaSigned, relatedStartups, updates = [], questions = [], isOwner = false, viewerStartupId = null, isLaunchMode, viewerUserId = null, viewerSuspended = false, previewing = false, viewerIsAdmin = false, metricHistory = [], identityRevealed = false, circumventionAcked = false, momentum = null, coInvestors = [], verificationCaseOpen = false, sourceLocale = null, initialTranslation = null, translationAvailable = true,
}: Props) {
  const [activeTab, setActiveTab]               = useState<Tab>("overview");
  const [isSaved, setIsSaved]                   = useState(false);
  const [viewerCount, setViewerCount]           = useState(1);
  const [bookingOpen, setBookingOpen]           = useState(false);
  // Phase 1: the non-circumvention acknowledgment gates first contact. Once
  // recorded (server-side, with IP + timestamp) the offer composer opens.
  const [acked, setAcked]                       = useState(circumventionAcked);
  const [ackModalOpen, setAckModalOpen]         = useState(false);
  // The offer button owns the composer; this page owns the terms that gate it,
  // so accepting them has to hand control back. Bumping this is that handover:
  // an investor who has just signed something should not have to go and find
  // the button again.
  const [offerResume, setOfferResume]           = useState(0);
  // B16: founder-controlled round state. Paused and closed rounds are refused
  // by the proposals route; oversubscribed still accepts (waitlist).
  const roundState = (startup as unknown as { round_state?: string }).round_state ?? "open";
  const roundOpen = roundState !== "paused" && roundState !== "closed";
  // The listing's overflow menu, and which of its two panes is showing. The
  // send-to-an-investor search replaces the list in place rather than opening
  // a second popover on top of the first.
  const [moreOpen, setMoreOpen]                 = useState(false);
  const [morePane, setMorePane]                 = useState<"menu" | "send">("menu");
  // Where the panel sits relative to its trigger. Neither edge alone is safe:
  // the row wraps, so on a phone the trigger can land mid-row with too little
  // room on either side, and a panel pinned to either edge falls off-screen.
  const [moreOffset, setMoreOffset]             = useState(0);
  useEscapeKey(moreOpen, () => { setMoreOpen(false); setMorePane("menu"); });

  function toggleMore(trigger: HTMLElement) {
    const r = trigger.getBoundingClientRect();
    const gutter = 12;
    const left = Math.min(Math.max(gutter, r.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - gutter);
    setMoreOffset(left - r.left);
    setMorePane("menu");
    setMoreOpen(o => !o);
  }
  // Every figure on this page is quoted in the round's own currency: a €68k
  // round shown in USD reads as a different round than the one being raised.
  const roundCurrency = (startup as { currency?: string | null }).currency ?? DEFAULT_CURRENCY;
  const [aiReport, setAiReport]                 = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [ndaModalOpen, setNdaModalOpen]         = useState(false);
  const [ddQuestions, setDdQuestions]           = useState("");
  const [ddSources, setDdSources]               = useState<{ read: string[]; skipped: string[] } | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  // userId is what launch mode keys the promotion on, and it must mean "there
  // is a signed-in member here" -- not "this member happens to own an
  // investor row". Passing investorId made every founder look anonymous, so a
  // founder viewing their OWN listing was told to upgrade to Angel to see
  // their own revenue.
  const accessCtx = { userId: viewerUserId ?? investorId, role: viewerIsAdmin ? "admin" as const : investorId ? "investor" as const : null, tier: investorTier, isLaunchMode, suspended: viewerSuspended };
  const caps          = investorCan(accessCtx);
  // NDA barrier (beyond the data room): a listing that demands an NDA keeps
  // its NUMBERS behind it too — revenue history is exactly what an NDA is
  // for. Tier still applies; the NDA stacks on top. Owner and admin exempt.
  const ndaBlocksFinancials = !!startup.require_nda && !ndaSigned && !isOwner && !viewerIsAdmin;
  const canFinancials = (caps.viewFinancials || isOwner || viewerIsAdmin) && !ndaBlocksFinancials;
  const canAi         = caps.aiDiligence === "included";
  const canTeam       = caps.viewTeam || isOwner || viewerIsAdmin;
  // A related card reads its lock off a tier value, so it gets the one this
  // page resolved rather than a flat null. caps.viewFinancials is the same
  // test the server applied when it chose whether to strip those rows, so the
  // padlock lands exactly where the numbers were nulled, never over an empty
  // field: below the gate the tier is dropped rather than forwarded, since a
  // suspended account keeps its paid tier but is sent stripped rows. Admin
  // and launch-mode access names no tier, so it takes the one that reads what
  // was sent. The NDA stays out of this: it covers this company's numbers,
  // not another company's.
  const relatedTier: SubscriptionTier | null = !caps.viewFinancials
    ? null
    : getInvestorPlan(investorTier).features.viewFinancials ? investorTier : "pro_investor";

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
  // Inline PDF viewer: keep the reader on the page instead of a new tab.
  const [viewerDoc, setViewerDoc] = useState<{ url: string; label: string } | null>(null);
  useEscapeKey(!!viewerDoc, () => setViewerDoc(null));
  // Best-effort view logging (migration 039); founders see the aggregate.
  function trackDoc(documentId: string) {
    fetch("/api/documents/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId }) }).catch(() => {});
  }
  // The reverse of the pipeline pill: when there is no deal yet, the profile
  // is where an investor decides to start one -- sending them to the portal
  // to re-find this startup by name was the long way round.


  async function toggleSave() {
    if (!investorId) { notify.info(t("startupDetail.signInToSave")); return; }
    // Through the API rather than a direct table write, so the plan's
    // watchlist cap (Explorer: 5) and the founder's "saved" notification apply
    // here exactly as they do on the browse page. Optimistic, rolled back on
    // error.
    const next = !isSaved;
    setIsSaved(next);
    const res = await fetch("/api/watchlist", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: startup.id }),
    });
    if (!res.ok) {
      setIsSaved(!next);
      notifyRefusal(res, await res.json().catch(() => ({})));
      return;
    }
    if (next) notify.success(t("toast.saved")); else notify.info(t("toast.unsaved"));
  }

  async function generateAiReport() {
    if (!canAi) return;
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/ai/due-diligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startupId: startup.id,
          // C29: your own questions, answered in their own section.
          questions: ddQuestions.split("\n").map((q) => q.trim()).filter(Boolean).slice(0, 5),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.code === "NDA_REQUIRED") {
        // The report is refused because the room is shut. Open the thing that
        // opens it rather than leaving the reason in a toast.
        setNdaModalOpen(true);
        return;
      }
      if (!res.ok || !data.report) {
        notifyRefusal(res, data);
        return;
      }
      setAiReport(data.report);
      setDdSources({ read: data.documentsRead ?? [], skipped: data.documentsSkipped ?? [] });
    } catch {
      notify.error(t("errors.generic"));
    } finally {
      setGeneratingReport(false);
    }
  }

  const { t } = useTranslation();
  const { notifyRefusal } = useRefusal();
  const score = startup.vaultrise_score ?? null;

  const TAB_LABELS: Record<Tab, string> = {
    overview:   t("startupDetail.overview"),
    team:       t("startupDetail.team"),
    financials: t("startupDetail.financials"),
    documents:  t("startupDetail.documents"),
    traction:   t("startupDetail.traction"),
  };

  return (
    /* The pitch is the part of this page that has never been localised. The
       offer sits at the top of the hero; the fields below read from it. */
    <TranslatedContent entityType="startup" entityId={startup.id}
      sourceLocale={sourceLocale} initialFields={initialTranslation} available={translationAvailable}>
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>
      {/* Same black-bar convention as the admin view-as banner: unmistakable,
          and one click out. Everything below really is the free-investor
          view -- the server stripped document URLs and zeroed the tier, so
          this is the truth, not a costume. */}
      {previewing && (
        <div role="status" style={{ background: "var(--cr-ink)", color: "var(--cr-paper)", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", flexWrap: "wrap", padding: "10px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: "13px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
            <Eye style={{ width: 14, height: 14, color: "var(--cr-copper-l)" }} />
            {t("preview.banner")}
          </span>
          <Link href={`/startups/${startup.slug}`} style={{ color: "var(--cr-copper-l)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}>
            {t("preview.exit")}
          </Link>
        </div>
      )}
      <PrintHeader title={startup.name} tagline={t("common.printTagline")} />

      {/* ── Editorial hero ── */}
      <div style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
        <div className="px-6 md:px-10" style={{ maxWidth: "1100px", margin: "0 auto", paddingTop: "40px", paddingBottom: "36px" }}>

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
              <EntityLogo
                name={startup.name}
                logoUrl={(startup as { logo_url?: string | null }).logo_url}
                logoColor={(startup as { logo_color?: string | null }).logo_color}
                size={60} radius={4}
              />

              {/* Name + tagline */}
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
                  <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 38px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                    {startup.name}
                  </h1>
                  {/* What this company has filed with the house, opening onto
                      the list itself. Silent with nothing on file and after a
                      lapse, which is why the slot is not reserved
                      unconditionally. */}
                  {(() => {
                    const legacyChecks = (startup as { verification_checks?: { checks?: string[]; at?: string } | null }).verification_checks ?? null;
                    if (!trustBadgeVisible({
                      level: startup.trust_level, verifiedAt: startup.verified_at,
                      expiresAt: startup.trust_expires_at, caseOpen: verificationCaseOpen, isOwner,
                    })) return null;
                    return (
                      <VerifiedBadge
                        kind="startup"
                        checks={legacyChecks}
                        verifiedAt={startup.verified_at}
                        trustLevel={startup.trust_level}
                        trustReviewedAt={startup.trust_reviewed_at}
                        trustExpiresAt={startup.trust_expires_at}
                        caseOpen={verificationCaseOpen}
                        isOwner={isOwner}
                        panel={
                          <TrustPanel
                            subject="startup"
                            level={startup.trust_level}
                            reviewedAt={startup.trust_reviewed_at}
                            expiresAt={startup.trust_expires_at}
                            legacyChecks={legacyChecks}
                            verifiedAt={startup.verified_at}
                            caseOpen={verificationCaseOpen}
                            isOwner={isOwner}
                          />
                        }
                      />
                    );
                  })()}
                  {(startup as { is_demo?: boolean }).is_demo && <DemoBadge />}
                  {startup.subscription_tier === "growth" && (
                    <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Featured
                    </span>
                  )}
                  {roundState !== "open" && (
                    <span style={{
                      fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", borderRadius: "3px", padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.06em",
                      background: roundState === "oversubscribed" ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                      border: `1px solid ${roundState === "oversubscribed" ? "var(--cr-copper-br)" : "var(--cr-rule-dark)"}`,
                      color: roundState === "oversubscribed" ? "var(--cr-copper)" : "var(--cr-ink-3)",
                    }}>
                      {t(`startupDetail.round_${roundState}`)}
                    </span>
                  )}
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", marginBottom: "12px" }}>
                  <T field="tagline">{startup.tagline}</T>
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
                  <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {startup.industry}
                  </span>
                  <span style={{ background: "var(--cr-paper-4)", border: "1px solid var(--cr-rule)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", borderRadius: "3px", padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {STAGE_LABELS[startup.stage] ?? startup.stage.replace(/_/g, " ")}
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
                      {countryLabel(t, startup.country)}
                    </span>
                  )}
                  {viewerCount > 1 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
                      <Eye style={{ width: 11, height: 11 }} /> <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: "var(--cr-ink-3)" }}>{viewerCount}</span> viewing
                    </span>
                  )}
                  {score != null && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <ScoreDial score={score} />
                      {/* A model produced this number about somebody's
                          company. Say what it measures, next to it. */}
                      <InfoTip termKey="glossary.aiScore" />
                    </span>
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

              {/* Action row. One primary: contact opens on an accepted offer
                  and on nothing else, so the offer is what this page is for.
                  Beside it, quiet pills of one shape and one weight; under the
                  menu, everything that carries the listing somewhere else --
                  the company's own links, the share targets, the export, the
                  send-to-an-investor search. As siblings those errands
                  outnumber the offer, and whatever outnumbers it outranks it. */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                  {!isOwner && !!investorId && !viewerSuspended && (
                    <OfferButton
                      startupId={startup.id}
                      companyName={startup.name}
                      ask={{
                        amount: startup.funding_target ?? null,
                        currency: roundCurrency,
                        equityPct: startup.equity_offered ?? null,
                        valuation: startup.valuation ?? null,
                        instrument: startup.instrument ?? null,
                      }}
                      // The live flag, not the prop: the terms can be accepted
                      // in this session, and the server prop only catches up on
                      // the next load. Reading the prop left the button dead for
                      // the rest of the visit.
                      acked={acked}
                      onNeedsAck={() => setAckModalOpen(true)}
                      openSignal={offerResume}
                      roundOpen={roundOpen}
                    />
                  )}

                  {viewerDeal && (
                    <Link href={`/deals?deal=${viewerDeal.id}`} style={QUIET_ACTION}>
                      <Handshake style={{ width: 13, height: 13 }} /> {t("startupDetail.viewInPipeline")}
                    </Link>
                  )}

                  {startup.booking_url && (
                    <button onClick={() => { track("startup", startup.id, "booking_open"); setBookingOpen(true); }} style={QUIET_ACTION}>
                      <CalendarClock style={{ width: 13, height: 13 }} /> {t("startupDetail.bookCall")}
                    </button>
                  )}

                  {/* The founder hears this one — unlike a watchlist save,
                      which is the investor's private bookmark. */}
                  {!viewerDeal && investorId && !viewerSuspended && (
                    <InterestedButton targetType="startup" targetId={startup.id} />
                  )}

                  {/* A closed or oversubscribed round catches the demand it
                      generates instead of dead-ending it. */}
                  {!viewerDeal && investorId && !viewerSuspended && (roundState === "closed" || roundState === "oversubscribed") && (
                    <WaitlistButton startupId={startup.id} roundState={roundState} />
                  )}

                  <button onClick={toggleSave} aria-pressed={isSaved}
                    style={{ ...QUIET_ACTION, color: isSaved ? "var(--cr-copper)" : "var(--cr-ink-2)", borderColor: isSaved ? "var(--cr-copper-br)" : "var(--cr-paper-4)" }}>
                    <Bookmark style={{ width: 13, height: 13, fill: isSaved ? "var(--cr-copper)" : "transparent" }} />
                    {isSaved ? t("toast.saved") : t("common.saveWatchlist")}
                  </button>

                  <span style={{ position: "relative", display: "inline-flex" }}>
                    <button onClick={(e) => toggleMore(e.currentTarget)}
                      aria-haspopup="menu" aria-expanded={moreOpen}
                      style={{ ...QUIET_ACTION, paddingInline: "12px", color: "var(--cr-ink-3)" }}>
                      <MoreHorizontal style={{ width: 15, height: 15 }} /> {t("startupDetail.moreActions")}
                    </button>
                    {moreOpen && (
                      <>
                        <span onClick={() => { setMoreOpen(false); setMorePane("menu"); }} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
                        <span style={{ position: "absolute", top: "calc(100% + 6px)", left: `${moreOffset}px`, zIndex: 61, width: MENU_WIDTH, boxSizing: "border-box", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: 4, boxShadow: "var(--cr-card-shadow-hover)", padding: 4, display: "flex", flexDirection: "column" }}>
                          {morePane === "send" ? (
                            <SharePickerPanel
                              startupId={startup.id}
                              onBack={() => setMorePane("menu")}
                              onDone={() => { setMoreOpen(false); setMorePane("menu"); }}
                            />
                          ) : (
                            <>
                              {(startup.website || startup.product_hunt_url) && (
                                <>
                                  <span style={MENU_LABEL}>{t("startupDetail.moreCompany")}</span>
                                  {startup.website && (
                                    <a href={startup.website} target="_blank" rel="noopener noreferrer"
                                      onClick={() => { track("startup", startup.id, "website_click"); setMoreOpen(false); }}
                                      style={MENU_ITEM} {...menuHover}>
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                                        <Globe style={{ width: 13, height: 13, color: "var(--cr-ink-4)" }} /> {t("startupDetail.website")}
                                      </span>
                                      <ExternalLink style={{ width: 12, height: 12, color: "var(--cr-ink-4)" }} />
                                    </a>
                                  )}
                                  {startup.product_hunt_url && (
                                    <a href={startup.product_hunt_url} target="_blank" rel="noopener noreferrer"
                                      onClick={() => { track("startup", startup.id, "producthunt_click"); setMoreOpen(false); }}
                                      style={MENU_ITEM} {...menuHover}>
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                                        <ExternalLink style={{ width: 13, height: 13, color: "var(--cr-ink-4)" }} /> {t("startupDetail.productHunt")}
                                      </span>
                                    </a>
                                  )}
                                  <span style={MENU_RULE} />
                                </>
                              )}

                              <span style={MENU_LABEL}>{t("common.share")}</span>
                              {[
                                { label: t("share.copyLink"), act: () => { track("startup", startup.id, "share_copy"); navigator.clipboard.writeText(window.location.href); notify.success(t("toast.linkCopied")); } },
                                { label: t("startupDetail.shareX"), act: () => { track("startup", startup.id, "share_social"); window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${startup.name} — ${startup.tagline ?? ""}`)}&url=${encodeURIComponent(window.location.href)}`, "_blank", "noopener,noreferrer"); } },
                                { label: t("startupDetail.shareLinkedIn"), act: () => { track("startup", startup.id, "share_social"); window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`, "_blank", "noopener,noreferrer"); } },
                                { label: t("onePager.open"), act: () => { track("startup", startup.id, "onepager_open"); window.open(`/startups/${startup.slug}/one-pager`, "_blank"); } },
                                { label: t("common.exportPdf"), act: () => window.print() },
                              ].map(item => (
                                <button key={item.label} onClick={() => { item.act(); setMoreOpen(false); }}
                                  style={MENU_ITEM} {...menuHover}>
                                  {item.label}
                                </button>
                              ))}
                              {investorId && !viewerSuspended && (
                                <button onClick={() => setMorePane("send")} aria-haspopup="menu"
                                  style={MENU_ITEM} {...menuHover}>
                                  {t("startupDetail.shareWith")}
                                  <span aria-hidden style={{ color: "var(--cr-ink-4)" }}>›</span>
                                </button>
                              )}
                            </>
                          )}
                        </span>
                      </>
                    )}
                  </span>
                </div>

                {/* A quieter register under the row. Both of these open a
                    textarea in place, and a control that grows downward cannot
                    sit in a wrapping row of pills without shoving its
                    neighbours around as it opens. */}
                {((viewerStartupId && !isOwner && !viewerSuspended) || (isSaved && investorId)) && (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "16px" }}>
                    {/* Peer founders only, since 012. An investor's two buttons
                        here were refused by /api/messages/start every time: the
                        contact policy wants an accepted offer first, so the pair
                        read as broken rather than as gated. The offer button
                        above is the investor's way in. */}
                    {viewerStartupId && !isOwner && !viewerSuspended && (
                      <FounderToFounder startupId={startup.id} />
                    )}
                    {isSaved && investorId && <InlineWatchNote startupId={startup.id} />}
                  </div>
                )}
              </div>
            </div>

            {/* B19: public momentum — opt-in, aggregates only. */}
            {momentum && (momentum.interested > 0 || momentum.committedAmount > 0 || momentum.softAmount > 0) && (() => {
              const target = startup.funding_target && startup.funding_target > 0 ? startup.funding_target : null;
              const pct = target ? Math.min(100, Math.round((momentum.committedAmount / target) * 100)) : null;
              return (
                <div style={{ marginBottom: "14px", padding: "12px 14px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: pct !== null ? "8px" : 0 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "14px", color: "var(--cr-copper)" }}>
                      {momentum.committedAmount > 0 ? formatMoney(momentum.committedAmount, momentum.currency, { compact: true }) : "—"}
                      {target && <span style={{ color: "var(--cr-ink-4)", fontWeight: 400 }}> / {formatMoney(target, momentum.currency, { compact: true })}</span>}
                    </span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)" }}>
                      {t("startupDetail.momentumCommitted", { count: momentum.committedCount })}
                      {momentum.softAmount > 0 && <> · {t("startupDetail.momentumSoft", { amount: formatMoney(momentum.softAmount, momentum.currency, { compact: true }) })}<InfoTip termKey="glossary.softCircle" /></>}
                      {" · "}{t("startupDetail.momentumInterested", { count: momentum.interested })}
                    </span>
                  </div>
                  {pct !== null && (
                    <div style={{ height: "5px", background: "var(--cr-paper-4)", borderRadius: "3px", overflow: "hidden" }}>
                      <div className="animate-draw-bar" style={{ ["--bar-width" as string]: `${pct}%`, width: `${pct}%`, height: "100%", background: "var(--cr-copper)" }} />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Key metrics strip */}
            <div className="grid grid-cols-2 md:grid-cols-4" style={{ borderTop: "1px solid var(--cr-rule)", borderLeft: "1px solid var(--cr-rule)" }}>
              <MetricCell label={t("startupDetail.raising")}  value={safeFormatCurrencyAmount(startup.funding_target)} copper />
              <MetricCell label={t("startupDetail.equity")}   value={startup.equity_offered != null ? `${startup.equity_offered}%` : null} />
              <MetricCell label={t("startupDetail.minCheck")} value={startup.min_check_size ? formatCurrency(startup.min_check_size, true) : t("startupDetail.minCheckNone")} />
              <MetricCell label={t("startupDetail.pageViews")} value={formatNumber(startup.pageviews ?? 0)} />
            </div>

            {/* Company facts — stored since onboarding but never surfaced before. */}
            {(() => {
              const facts: Array<{ label: string; value: string }> = [];
              if (startup.founded_year) facts.push({ label: t("startupDetail.founded"), value: String(startup.founded_year) });
              if (startup.team_size) facts.push({ label: t("startupDetail.teamSize"), value: startup.team_size });
              const loc = [startup.city, countryLabel(t, startup.country)].filter(Boolean).join(", ");
              if (loc) facts.push({ label: t("startupDetail.location"), value: loc });
              if (startup.business_model) facts.push({ label: t("startupDetail.businessModel"), value: startup.business_model });
              if (startup.company_type) facts.push({ label: t("startupDetail.companyType"), value: startup.company_type });
              if (startup.previous_funding) facts.push({ label: t("startupDetail.previousFunding"), value: formatCurrency(startup.previous_funding, true) });
              if (facts.length === 0) return null;
              return (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--cr-rule)" }}>
                  {facts.map((f) => (
                    <div key={f.label}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>{f.label}</div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)" }}>{f.value}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-6 md:px-10" style={{ maxWidth: "1100px", margin: "0 auto", paddingTop: "32px", paddingBottom: "64px" }}>

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
              style={{ background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-band-ink)", padding: "8px 20px", cursor: "pointer", whiteSpace: "nowrap", opacity: generatingReport ? 0.6 : 1 }}>
              {generatingReport ? t("startupDetail.generating") : t("startupDetail.generateReport")}
            </button>
            {/* C29: your own questions, answered in their own section. The
                report reads the data-room files you are entitled to open. */}
            <textarea value={ddQuestions} onChange={(e) => setDdQuestions(e.target.value.slice(0, 1500))} rows={2}
              placeholder={t("startupDetail.ddQuestionsPh")}
              style={{ width: "100%", boxSizing: "border-box", background: "var(--cr-paper)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "9px 12px", outline: "none", resize: "vertical" }} />
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
            {/* What the model could actually read. A report that silently
                skipped the financial model must not look complete. */}
            {ddSources && (ddSources.read.length > 0 || ddSources.skipped.length > 0) && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "12px", lineHeight: 1.5 }}>
                {ddSources.read.length > 0
                  ? t("startupDetail.ddRead", { docs: ddSources.read.join(", ") })
                  : t("startupDetail.ddReadNone")}
                {ddSources.skipped.length > 0 && ` · ${t("startupDetail.ddSkipped", { docs: ddSources.skipped.join(", ") })}`}
              </p>
            )}
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{aiReport}</p>
          </div>
        )}

        {/* ── Custom tab bar ── */}
        {/* Five tabs at 13px do not fit 375px; without its own scroll the
            strip widened the PAGE, and the whole listing scrolled sideways.
            The strip scrolls; the page does not — same fix as every other
            tab bar on the site. */}
        <div style={{ borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: "28px", display: "flex", gap: "0", overflowX: "auto", whiteSpace: "nowrap" }}>
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
            {/* The prose sections read from the translation when one is
                showing, and from the founder's own text otherwise. */}
            {startup.problem             && <Section title={t("startupDetail.problem")}><T field="problem">{startup.problem}</T></Section>}
            {startup.solution            && <Section title={t("startupDetail.solution")}><T field="solution">{startup.solution}</T></Section>}
            {startup.market              && <Section title={t("startupDetail.market")}><T field="market">{startup.market}</T></Section>}
            {/* Market sizing — only when at least one figure exists (never an empty card). */}
            {(startup.tam || startup.sam || startup.som) ? (
              <div>
                <h3 className="ruled-label" style={{ marginBottom: "12px" }}>{t("startupDetail.marketOpportunity")}</h3>
                <div className="grid grid-cols-3" style={{ gap: "10px" }}>
                  {([
                    ["tam", t("startupDetail.marketTotal"), startup.tam],
                    ["sam", t("startupDetail.marketServiceable"), startup.sam],
                    ["som", t("startupDetail.marketObtainable"), startup.som],
                  ] as Array<[string, string, number | null | undefined]>).map(([id, label, v]) => (
                    <div key={id} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "12px 14px" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "clamp(16px, 2.6vw, 22px)", color: "var(--cr-copper)" }}>{safeFormatCurrencyAmount(v ?? null)}</div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "4px" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {startup.competitive_advantage && <Section title={t("startupDetail.competitiveAdvantage")}><T field="competitive_advantage">{startup.competitive_advantage}</T></Section>}
            {startup.use_of_funds        && <Section title={t("startupDetail.useOfFunds")}><T field="use_of_funds">{startup.use_of_funds}</T></Section>}

            {/* Competitors — captured at onboarding, never shown until now. */}
            {Array.isArray(startup.competitors_json) && startup.competitors_json.length > 0 && (
              <div>
                <div className="ruled-label" style={{ marginBottom: "14px" }}>{t("startupDetail.competitors")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
                  {startup.competitors_json.filter((c) => c?.name).map((c, i) => (
                    <div key={i} style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "14px 16px" }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: c.differentiator ? "4px" : 0 }}>{c.name}</div>
                      {c.differentiator && <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>{c.differentiator}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                  <TrackedVideo startupId={startup.id} url={startup.video_pitch_url as string} />
                </div>
              </div>
            )}

            {/* Metric history: rendered only when the server sent it — the
                same financial gate as the single MRR figure, enforced where
                the data lives rather than here. */}
            {metricHistory.length >= 2 && (
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px" }}>
                <TractionChart points={metricHistory} />
              </div>
            )}

            {/* Demo video */}
            {startup.demo_video_url && startup.subscription_tier === "growth" && (
              <div>
                <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("startupDetail.productDemo")}</div>
                {canFinancials ? (
                  <div style={{ aspectRatio: "16/9", borderRadius: "4px", overflow: "hidden", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)" }}>
                    <TrackedVideo startupId={startup.id} url={startup.demo_video_url} />
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
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", marginBottom: q.answer || q.asker ? "6px" : 0 }}>
                        <span style={{ color: "var(--cr-copper)", fontWeight: 700 }}>Q&nbsp;</span>{q.question}
                      </p>
                      {/* B20: the founder sees who asked (investors and the public don't). */}
                      {q.asker && (
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: q.answer ? "8px" : "8px" }}>
                          {t("startupDetail.askedBy")}{" "}
                          <Link href={`/investors/${q.asker.slug}`} style={{ color: "var(--cr-copper)", textDecoration: "none", fontWeight: 500 }}>{q.asker.name || t("deals.investorFallback")}</Link>
                          {" · "}<span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400 }}>{formatDate(q.created_at)}</span>
                        </p>
                      )}
                      {q.answer ? (
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          <span style={{ color: "var(--cr-up)", fontWeight: 700 }}>A&nbsp;</span>{q.answer}
                          {q.is_private && <span style={{ marginLeft: 8, fontSize: "10px", color: "var(--cr-ink-4)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("startupDetail.privateAnswer")}</span>}
                        </p>
                      ) : isOwner ? (
                        <QAAnswerBox questionId={q.id} />
                      ) : (
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>—</p>
                      )}
                    </div>
                  ))}
                  {investorId && !viewerSuspended && <QAAskBox startupId={startup.id} />}
                </div>
              </div>
            )}

            {/* C33: co-investors who chose to be visible. Investor-only. */}
            {investorId && coInvestors.length > 0 && (
              <div style={{ marginTop: "8px", padding: "12px 14px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "6px" }}>
                  {t("coInvestors.title", { count: coInvestors.length })}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {coInvestors.map((c) => (
                    <Link key={c.slug} href={`/investors/${c.slug}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "999px", padding: "4px 10px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-2)" }}>
                      {c.name || t("deals.investorFallback")}
                    </Link>
                  ))}
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "8px" }}>{t("coInvestors.hint")}</p>
              </div>
            )}

            {/* C27: your own read on this company, kept private to you. */}
            {investorId && !viewerSuspended && <ScorecardPanel startupId={startup.id} />}

            {/* D44: the round's arithmetic, done once, here — instead of every
                investor reverse-engineering it from "€500k for 8%". */}
            {(() => {
              const st = startup as unknown as { valuation?: number | null; valuation_type?: string | null; instrument?: string | null; safe_cap?: number | null; safe_discount?: number | null };
              const inputs = { raise: startup.funding_target, equityOffered: startup.equity_offered, valuation: st.valuation ?? null, valuationType: (st.valuation_type as ValuationType | null) ?? null };
              const post = postMoney(inputs) ?? impliedPostFromEquity(inputs);
              const isImplied = postMoney(inputs) === null && post !== null;
              if (post === null && !st.safe_cap) return null;
              const pre = postMoney(inputs) !== null ? preMoney(inputs) : null;
              const dil = postMoney(inputs) !== null ? impliedDilutionPct(inputs) : (startup.equity_offered ?? null);
              const cheque = startup.min_check_size ?? 50_000;
              const own = post !== null ? ownershipForCheque(cheque, { ...inputs, valuation: post, valuationType: "post" }) : null;
              const gap = equityValuationMismatch(inputs);
              const cur = roundCurrency;
              const cell = (label: string, value: string, note?: string, termKey?: string) => (
                <div key={label} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "12px 14px" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "clamp(15px, 2.4vw, 20px)", color: "var(--cr-copper)" }}>{value}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "4px" }}>
                    {label}
                    {termKey && <InfoTip termKey={termKey} />}
                  </div>
                  {note && <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{note}</div>}
                </div>
              );
              return (
                <div>
                  <h3 className="ruled-label" style={{ marginBottom: "12px" }}>{t("round.title")}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: "10px" }}>
                    {post !== null && cell(isImplied ? t("round.impliedPost") : t("round.postMoney"), formatMoney(post, cur, { compact: true }), isImplied ? t("round.impliedNote") : undefined, "glossary.preMoney")}
                    {pre !== null && cell(t("round.preMoney"), formatMoney(pre, cur, { compact: true }), undefined, "glossary.preMoney")}
                    {dil != null && cell(t("round.dilution"), `${dil.toFixed(1)}%`)}
                    {own != null && cell(t("round.perCheque"), `${own.toFixed(2)}%`, t("round.perChequeNote", { amount: formatMoney(cheque, cur, { compact: true }) }))}
                    {st.safe_cap ? cell(t("round.cap"), formatMoney(st.safe_cap, cur, { compact: true }), st.safe_discount ? `${st.safe_discount}% ${t("round.discountShort")}` : undefined, "glossary.safe") : null}
                  </div>
                  {st.instrument && (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "8px" }}>
                      {t(st.instrument === "safe" ? "round.safe" : st.instrument === "convertible_note" ? "round.note" : "round.equity")}
                    </p>
                  )}
                  {/* The slider answers the one question the cells above set
                      up: "and what would MY cheque buy?" */}
                  {post !== null && (
                    <RoundCalculator
                      postMoney={post}
                      currency={cur}
                      minCheck={(startup as { min_check_size?: number | null }).min_check_size ?? null}
                      fundingTarget={startup.funding_target}
                    />
                  )}
                {!isOwner && !viewerIsAdmin && <RiskWarning />}
                  {/* Owners see the contradiction before investors do. */}
                  {isOwner && gap !== null && gap > 0.5 && (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-down)", marginTop: "8px", lineHeight: 1.5 }}>
                      {t("round.mismatch", { stated: String(startup.equity_offered), implied: (impliedDilutionPct(inputs) ?? 0).toFixed(1) })}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* The economics of this deal: the 2% success fee is on the founder,
                at close, and nothing before. Investors see their share of it on
                their own check size (it is zero); founders see 2% vs a broker. */}
            <div style={{ marginTop: "8px" }}>
              <h3 className="ruled-label" style={{ marginBottom: "12px" }}>{t("feeCalc.sectionTitle")}</h3>
              <FeeCalculator
                variant={isOwner ? "raise" : "check"}
                currency={roundCurrency}
                defaultAmount={isOwner ? (startup.funding_target ?? 500_000) : (startup.min_check_size ?? 50_000)}
              />
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "8px", lineHeight: 1.5 }}>
                {t("feeCalc.detailNote")}
              </p>
            </div>
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

        {activeTab === "team" && canTeam && !identityRevealed && startup.founders && startup.founders.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", marginBottom: "14px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px" }}>
            <Lock style={{ width: 14, height: 14, color: "var(--cr-copper)", flexShrink: 0 }} />
            {/* A sentence, not a third entry point. The offer lives in one
                place on this page, and a second copy of it here could not
                read the state that decides what it should say. */}
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", lineHeight: 1.5 }}>
              {t("startupDetail.identityProtected")}
            </p>
          </div>
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
                        <img src={f.photo_url} alt={f.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
          ndaBlocksFinancials && caps.viewFinancials ? (
            <GateBlur
              title={t("ndaGate.financialsTitle")}
              description={t("ndaGate.financialsDesc")}
              ctaLabel={t("startupDetail.signNdaAccess")}
              onCta={() => setNdaModalOpen(true)}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                <MetricCell label={t("startupDetail.mrr")} value={null} />
                <MetricCell label={t("startupDetail.arr")} value={null} />
                <MetricCell label={t("startupDetail.totalUsers")} value={null} />
                <MetricCell label={t("startupDetail.growth")} value={null} />
              </div>
            </GateBlur>
          ) : canFinancials ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
              <MetricCell label={t("startupDetail.mrr")}    value={startup.mrr         ? safeFormatMRR(startup.mrr)        : null} termKey="glossary.mrr" />
              <MetricCell label={t("startupDetail.arr")}    value={startup.arr         ? safeFormatMRR(startup.arr)        : null} termKey="glossary.arr" />
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
                <MetricCell label={t("startupDetail.mrr")} value={null} />
                <MetricCell label={t("startupDetail.arr")} value={null} />
                <MetricCell label={t("startupDetail.totalUsers")} value={null} />
                <MetricCell label={t("startupDetail.growth")} value={null} />
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
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, color-mix(in srgb, var(--cr-paper) 95%, transparent) 40%, transparent)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: "20px" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "12px" }}>{t("startupDetail.signUpPitchDeck")}</p>
                  <Link href="/auth/signup" style={{ background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "9px 22px", borderRadius: "4px", textDecoration: "none" }}>
                    {t("startupDetail.createFreeAccount")} →
                  </Link>
                </div>
              </div>
            )}

            {startup.documents && startup.documents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {startup.documents.map((doc) => {
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
                      {/* The NDA button is only a way forward for somebody who
                          has an investor entity to sign with. A visitor sent
                          to the dialog met a 401 and no route out, so they
                          fall through to the sign-in hint below. */}
                      {requiresNda && investorId ? (
                        <button onClick={() => setNdaModalOpen(true)}
                          style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", padding: "7px 14px", cursor: "pointer" }}>
                          <Lock style={{ width: 11, height: 11 }} />
                          {t("startupDetail.signNdaAccess")}
                        </button>
                      ) : !doc.file_url ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-4)", padding: "7px 4px" }}>
                          <Lock style={{ width: 11, height: 11 }} /> {t("startupDetail.signInToView")}
                        </span>
                      ) : (
                        (doc.is_pdf ?? /\.pdf(\?|$)/i.test(doc.file_url)) ? (
                          <button onClick={() => { trackDoc(doc.id); setViewerDoc({ url: doc.file_url, label: doc.label }); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-band-ink)", padding: "7px 14px", cursor: "pointer" }}>
                            <Eye style={{ width: 11, height: 11 }} /> {t("common.view")}
                          </button>
                        ) : (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" onClick={() => trackDoc(doc.id)}
                          style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-band-ink)", padding: "7px 14px", textDecoration: "none" }}>
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
          <div role="dialog" aria-modal="true" aria-label={viewerDoc.label} style={{ position: "fixed", inset: 0, zIndex: 80 }}>
            <div style={{ position: "absolute", inset: 0, background: "var(--cr-scrim)" }} onClick={() => setViewerDoc(null)} />
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
                <MetricCell label={t("startupDetail.monthlyRevenue")} value={null} copper />
                <MetricCell label={t("startupDetail.annualRevenue")} value={null} />
                <MetricCell label={t("startupDetail.totalUsers")} value={null} />
                <MetricCell label={t("startupDetail.momGrowth")} value={null} />
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
                <StartupCard key={s.id} startup={s} investorTier={relatedTier} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── NDA accept dialog ── */}
      <NdaAgreementDialog
        open={ndaModalOpen}
        startupId={startup.id}
        startupName={startup.name}
        onCancel={() => setNdaModalOpen(false)}
        onAccepted={() => {
          notify.success(t("startupDetail.ndaAccepted"));
          setNdaModalOpen(false);
          // Re-fetch so ndaSigned becomes true server-side and the room unlocks.
          router.refresh();
        }}
      />

      {/* ── Non-circumvention acknowledgment (first contact only) ── */}
      <NonCircumventionModal
        open={ackModalOpen}
        startupId={startup.id}
        startupName={startup.name}
        onCancel={() => setAckModalOpen(false)}
        // Straight back into the composer that raised this. Confirming into a
        // closed modal and an unchanged page reads as the terms not having
        // registered.
        onConfirmed={() => { setAcked(true); setAckModalOpen(false); setOfferResume(n => n + 1); }}
      />

      {/* The header's action row wraps into a block on a phone and is gone the
          moment you scroll to the traction. What follows you down is what can
          be duplicated honestly: the watchlist toggle reads the same state as
          the one above, and the pipeline link is a link. The offer is NOT
          here, because it is mounted once and a second copy would go on
          saying "Make an offer" after the first one had sent it. */}
      <StickyActionBar>
        <button
          onClick={toggleSave}
          aria-pressed={isSaved}
          style={{
            flex: 1, minWidth: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
            height: "44px", paddingInline: "14px",
            border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)", borderRadius: "4px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
            color: isSaved ? "var(--cr-copper)" : "var(--cr-ink-3)", cursor: "pointer",
          }}
        >
          <Bookmark style={{ width: 15, height: 15, flexShrink: 0, fill: isSaved ? "var(--cr-copper)" : "transparent" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isSaved ? t("toast.saved") : t("common.saveWatchlist")}
          </span>
        </button>

        {viewerDeal && (
          <Link href={`/deals?deal=${viewerDeal.id}`}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
              height: "44px", minWidth: 0, textDecoration: "none",
              background: "var(--cr-copper)", border: "1px solid var(--cr-copper-d)", borderRadius: "4px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-band-ink)",
            }}
          >
            <Handshake style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t("startupDetail.viewInPipeline")}
            </span>
          </Link>
        )}
      </StickyActionBar>

      {/* Booking, without leaving the page. Some providers refuse framing —
          the fallback link inside the modal covers those. */}
      {bookingOpen && startup.booking_url && (
        <div role="dialog" aria-modal="true" onClick={() => setBookingOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "var(--cr-scrim)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: 8, width: "min(920px, 96vw)", height: "min(700px, 90vh)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--cr-rule)" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "var(--cr-ink)" }}>{t("startupDetail.bookCall")}</span>
              <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                <a href={startup.booking_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 12, color: "var(--cr-copper)" }}>
                  {t("startupDetail.bookInNewTab")} ↗
                </a>
                <button onClick={() => setBookingOpen(false)} aria-label={t("common.close")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </span>
            </div>
            <iframe src={startup.booking_url} title={t("startupDetail.bookCall")}
              style={{ flex: 1, border: "none", width: "100%" }} />
          </div>
        </div>
      )}
    </main>
    </TranslatedContent>
  );
}
