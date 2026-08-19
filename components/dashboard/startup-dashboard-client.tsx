"use client";

import { useRouter } from "next/navigation";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Bookmark, Brain, CheckCircle2, Circle, CreditCard, Crosshair, ExternalLink, Eye, FileText, Handshake, LayoutGrid, Lock, MessageSquare, Settings, TrendingUp, Users, X, Zap } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Profile, Startup } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { InvitePanel } from "@/components/shared/invite-panel";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { notify } from "@/components/ui/toast-notify";
import { listingCompleteness } from "@/lib/listing-completeness";
import { MetricsRecorder } from "@/components/dashboard/metrics-recorder";
import { FundraiseChecklist } from "@/components/dashboard/fundraise-checklist";

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
}

type StartupTab = "overview" | "documents" | "ai" | "billing";



// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    active:         { bg: "var(--cr-up-bg)",     color: "var(--cr-up)",      border: "rgba(45,106,79,0.25)" },
    pending_review: { bg: "rgba(245,158,11,0.08)", color: "#B45309",          border: "rgba(180,83,9,0.25)"  },
    suspended:      { bg: "var(--cr-down-bg)",   color: "var(--cr-down)",    border: "rgba(180,50,50,0.2)"  },
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
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {labelKeys[status] ? t(labelKeys[status]) : status.replace(/_/g, " ")}
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
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <Bookmark style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
          {t("dashboard.whoSaved")}
        </h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--cr-ink-4)" }}>{data.count}</span>
      </div>

      {data.locked ? (
        <>
          {/* Real shape, unreadable content -- the count is honest, the names
              are what the plan buys. */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }} aria-hidden>
            {Array.from({ length: Math.min(data.count, 3) }).map((_, i) => (
              <div key={i} style={{ height: "14px", width: `${55 + i * 12}%`, background: "var(--cr-paper-4)", borderRadius: "3px" }} />
            ))}
          </div>
          <Link href="/pricing" style={{ ...primaryBtn, display: "flex", justifyContent: "center", marginTop: "14px", width: "100%", boxSizing: "border-box" }}>
            {t("dashboard.upgradeSeeWho")}
          </Link>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {data.savers.map((s) => (
            <Link key={s.slug} href={`/investors/${s.slug}`}
              style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", textDecoration: "none" }}>
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
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <Eye style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
          {t("dashboard.whoViewed")}
        </h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--cr-ink-4)" }}>{data.count}</span>
      </div>

      {data.locked ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }} aria-hidden>
            {Array.from({ length: Math.min(data.count, 3) }).map((_, i) => (
              <div key={i} style={{ height: "14px", width: `${60 + i * 10}%`, background: "var(--cr-paper-4)", borderRadius: "3px" }} />
            ))}
          </div>
          <Link href="/pricing" style={{ ...primaryBtn, display: "flex", justifyContent: "center", marginTop: "14px", width: "100%", boxSizing: "border-box" }}>
            {t("dashboard.upgradeSeeWho")}
          </Link>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {data.viewers.map((v) => (
            <Link key={v.slug} href={`/investors/${v.slug}`}
              style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", textDecoration: "none" }}>
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
 * 30 hairline bars, one per day, oldest left. Pure presentation: no axis, no
 * numbers -- the count above it is the number; this is its shape. Flat-zero
 * histories render nothing rather than an empty ruler.
 */
function ViewsSparkline({ series }: { series: number[] }) {
  const max = Math.max(...series);
  if (max === 0) return null;
  const W = 120, H = 22, bw = W / series.length;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ display: "block", marginTop: "8px" }}>
      {series.map((v, i) => {
        const h = v === 0 ? 1 : Math.max(2, (v / max) * H);
        return (
          <rect key={i} x={i * bw + 0.5} y={H - h} width={bw - 1} height={h}
            fill={v === 0 ? "var(--cr-paper-4)" : "var(--cr-copper)"} opacity={v === 0 ? 0.6 : 0.75} rx={0.5} />
        );
      })}
    </svg>
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
  if (!target || (softCircled === 0 && committed === 0)) return null;
  const pctC = Math.min(100, (committed / target) * 100);
  const pctS = Math.min(100 - pctC, (softCircled / target) * 100);
  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("dashboard.raiseProgress")}</h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
          {formatCurrency(committed + softCircled, true)} <span style={{ fontWeight: 300, color: "var(--cr-ink-4)" }}>/ {formatCurrency(target, true)}</span>
        </span>
      </div>
      <div style={{ height: "8px", background: "var(--cr-paper-4)", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${pctC}%`, background: "var(--cr-up)" }} />
        <div style={{ width: `${pctS}%`, background: "var(--cr-copper)", opacity: 0.75 }} />
      </div>
      <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-3)" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--cr-up)", marginRight: 5 }} />
          {t("dashboard.committed")}: {formatCurrency(committed, true)}
        </span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-3)" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--cr-copper)", opacity: 0.75, marginRight: 5 }} />
          {t("dashboard.softCircled")}: {formatCurrency(softCircled, true)}
        </span>
      </div>
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
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "18px 20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>{t("dashboard.roundStatusTitle")}</h3>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{t("dashboard.roundStatusHint")}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
        {STATES.map(([v, label]) => (
          <button key={v} disabled={busy} onClick={() => v !== state && save({ roundState: v })} aria-pressed={v === state}
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "7px 12px", borderRadius: "999px", cursor: "pointer",
              background: v === state ? "var(--cr-copper)" : "var(--cr-paper-3)", color: v === state ? "#fff" : "var(--cr-ink-3)", border: `1px solid ${v === state ? "var(--cr-copper)" : "var(--cr-rule-dark)"}` }}>
            {label}
          </button>
        ))}
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", marginBottom: "12px", lineHeight: 1.5 }}>
        {t(`dashboard.roundHelp_${state}`)}
      </p>
      <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", paddingTop: "12px", borderTop: "1px solid var(--cr-rule)" }}>
        <input type="checkbox" checked={momentum} disabled={busy} onChange={(e) => save({ showMomentum: e.target.checked })} style={{ marginTop: 3, accentColor: "var(--cr-copper)" }} />
        <span>
          <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>{t("dashboard.momentumToggle")}</span>
          <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11.5px", color: "var(--cr-ink-4)", marginTop: 2 }}>{t("dashboard.momentumHint")}</span>
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
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "18px 20px", marginBottom: "16px" }}>
      <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "12px" }}>{t("dashboard.funnelTitle")}</h3>
      <div style={{ display: "grid", gap: "8px" }}>
        {steps.map(([label, v], i) => {
          const prev = i > 0 ? steps[i - 1][1] : null;
          const conv = prev && prev > 0 ? Math.round((v / prev) * 100) : null;
          return (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "110px 1fr 56px 44px", alignItems: "center", gap: "10px" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)" }}>{label}</span>
              <div style={{ height: "10px", background: "var(--cr-paper-4)", borderRadius: "5px", overflow: "hidden" }}>
                <div className="animate-draw-bar" style={{ ["--bar-width" as string]: `${(v / max) * 100}%`, width: `${(v / max) * 100}%`, height: "100%", background: i >= 3 ? "var(--cr-up)" : "var(--cr-copper)" }} />
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

/** B20: the founder's question queue — unanswered first, asker named. */
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
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "18px 20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: "12px" }}>
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>{t("dashboard.qaQueueTitle")}</h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: open.length ? "var(--cr-copper)" : "var(--cr-ink-4)" }}>{t("dashboard.qaOpenCount", { count: open.length })}</span>
      </div>
      <div style={{ display: "grid", gap: "10px" }}>
        {open.map((q) => {
          const d = drafts[q.id] ?? { a: "", priv: false };
          const who = q.investor?.display_name || q.investor?.firm_name || t("deals.investorFallback");
          return (
            <div key={q.id} style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "12px 14px" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "4px" }}><span style={{ color: "var(--cr-copper)", fontWeight: 700 }}>Q&nbsp;</span>{q.question}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>
                {t("startupDetail.askedBy")}{" "}
                {q.investor ? <Link href={`/investors/${q.investor.slug}`} style={{ color: "var(--cr-copper)", textDecoration: "none", fontWeight: 500 }}>{who}</Link> : who}
                {" · "}{formatDate(q.created_at)}
              </p>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <textarea value={d.a} onChange={(e) => setDrafts((p) => ({ ...p, [q.id]: { ...d, a: e.target.value } }))} rows={2} maxLength={3000} placeholder={t("startupDetail.answerPh")}
                  style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "9px 11px", outline: "none", resize: "vertical" }} />
                <button disabled={!!d.busy || !d.a.trim()} onClick={() => answer(q.id)}
                  style={{ border: "none", background: "var(--cr-copper)", color: "#fff", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", padding: "9px 14px", cursor: "pointer", opacity: !d.a.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
                  {d.busy ? "…" : t("startupDetail.answerSend")}
                </button>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11.5px", color: "var(--cr-ink-3)" }}>
                <input type="checkbox" checked={d.priv} onChange={(e) => setDrafts((p) => ({ ...p, [q.id]: { ...d, priv: e.target.checked } }))} style={{ accentColor: "var(--cr-copper)" }} />
                {t("startupDetail.answerPrivately")}
              </label>
            </div>
          );
        })}
        {answered.length > 0 && (
          <details>
            <summary style={{ cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.qaAnsweredCount", { count: answered.length })}</summary>
            <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
              {answered.map((q) => (
                <div key={q.id} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)", padding: "8px 10px", background: "var(--cr-paper)", border: "1px solid var(--cr-rule)", borderRadius: "4px" }}>
                  <span style={{ color: "var(--cr-ink)", fontWeight: 500 }}>{q.question}</span> — {q.answer}
                  {q.is_private && <span style={{ marginLeft: 6, fontSize: "10px", color: "var(--cr-ink-4)" }}>({t("startupDetail.privateAnswer")})</span>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/** B24: NDA & signature roster — who signed what, when. */
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
  const cell: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-2)", padding: "7px 8px", borderBottom: "1px solid var(--cr-rule)", whiteSpace: "nowrap" };
  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "18px 20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: "10px" }}>
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>{t("dashboard.rosterTitle")}</h3>
        <button onClick={exportCsv} style={{ background: "none", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-3)", padding: "5px 10px", cursor: "pointer" }}>{t("dashboard.exportCsv")}</button>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11.5px", color: "var(--cr-ink-4)", marginBottom: "10px" }}>{t("dashboard.rosterHint")}</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{[t("dashboard.rosterType"), t("dashboard.rosterParty"), t("dashboard.rosterWhen"), t("dashboard.rosterMethod"), "IP"].map((h) => <th key={h} style={{ ...cell, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cr-ink-4)", textAlign: "left" }}>{h}</th>)}</tr></thead>
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
    replied:    { label: "dashboard.tsReplied",   color: "var(--cr-up)"     },
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
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <Crosshair style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
          {t("dashboard.yourTargets")}
        </h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--cr-ink-4)" }}>{targets.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {targets.map((tg) => (
          <div key={tg.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
            <Link href={`/investors/${tg.slug}`}
              style={{ display: "flex", flexDirection: "column", gap: "2px", textDecoration: "none", minWidth: 0 }}>
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
                <div style={{ display: "flex", gap: 6 }}>
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
                  style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: tg.nextContactAt && new Date(tg.nextContactAt) < new Date() ? "var(--cr-down)" : "var(--cr-ink-3)", padding: "2px 6px", outline: "none" }} />
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
              style={{ background: "transparent", border: `1px solid ${STATUS_STYLE[tg.status]?.color ?? "var(--cr-rule-dark)"}`, color: STATUS_STYLE[tg.status]?.color ?? "var(--cr-ink-4)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
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
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Zap style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
          <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("dashboard.postUpdate")}</h3>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)}
            style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "7px 14px", cursor: "pointer" }}>
            {t("dashboard.postUpdate")}
          </button>
        )}
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={150} placeholder={t("dashboard.updTitle")}
            style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)", padding: "10px 12px", outline: "none" }} />
          <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={5000} rows={4} placeholder={t("dashboard.updBody")}
            style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "10px 12px", outline: "none", resize: "vertical" }} />
          {/* Audience: savers, deal investors (closed included), or both. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginRight: 4 }}>{t("dashboard.audienceLabel")}</span>
            {(["all", "watchers", "deals"] as const).map((a) => (
              <button key={a} type="button" onClick={() => setAudience(a)} aria-pressed={audience === a}
                style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", padding: "4px 10px", borderRadius: "999px", cursor: "pointer", background: audience === a ? "var(--cr-copper)" : "var(--cr-paper-3)", color: audience === a ? "#fff" : "var(--cr-ink-3)", border: `1px solid ${audience === a ? "var(--cr-copper)" : "var(--cr-rule-dark)"}` }}>
                {t(AUD_KEY[a])}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button onClick={() => setOpen(false)}
              style={{ border: "1px solid var(--cr-rule-dark)", background: "transparent", color: "var(--cr-ink-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", padding: "8px 14px", cursor: "pointer" }}>
              {t("common.cancel")}
            </button>
            <button onClick={publish} disabled={busy || !title.trim() || !body.trim()}
              style={{ border: "none", background: "var(--cr-copper)", color: "#fff", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", padding: "8px 16px", cursor: busy ? "wait" : "pointer", opacity: !title.trim() || !body.trim() ? 0.5 : 1 }}>
              {busy ? t("common.saving") : t("dashboard.updPost")}
            </button>
          </div>
        </div>
      )}
      {history.length > 0 && (
        <details style={{ marginTop: "14px" }}>
          <summary style={{ cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.updHistory", { count: history.length })}</summary>
          <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
            {history.map((u) => (
              <div key={u.id} style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "10px 12px" }}>
                {editing?.id === u.id ? (
                  <div style={{ display: "grid", gap: "6px" }}>
                    <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={150}
                      style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", padding: "8px 10px", outline: "none" }} />
                    <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} maxLength={5000} rows={3}
                      style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px", color: "var(--cr-ink)", padding: "8px 10px", outline: "none", resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => setEditing(null)} style={{ background: "none", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-3)", padding: "5px 10px", cursor: "pointer" }}>{t("common.cancel")}</button>
                      <button onClick={saveEdit} style={{ background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "#fff", padding: "5px 12px", cursor: "pointer" }}>{t("common.save")}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>{u.title}</p>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>{formatDate(u.created_at)}{u.updated_at ? ` · ${t("dashboard.updEditedTag")}` : ""}</span>
                    </div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", marginTop: 3, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{u.body}</p>
                    <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center" }}>
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
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <FileText style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("dashboard.docAnalytics")}</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {data.docs.map((d) => (
          <div key={d.id}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>{d.label}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>
                {t("dashboard.docOpens", { opens: d.opens, viewers: d.distinctViewers })}
              </span>
            </div>
            {!data.locked && d.viewers.length > 0 && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px" }}>
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

export function StartupDashboardClient({ profile, startup, analytics, isLaunchMode, viewingAs, rejectionReason = null }: Props) {
  const { t }        = useTranslation();
  const router       = useRouter();
  const [aiFeedback, setAiFeedback]           = useState<any>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [activeTab, setActiveTab]             = useState<StartupTab>("overview");

  const TABS: { value: StartupTab; label: string }[] = [
    { value: "overview",  label: t("dashboard.overview")    },
    { value: "documents", label: t("dashboard.documents")   },
    { value: "ai",        label: t("dashboard.aiFeedback")  },
    { value: "billing",   label: t("dashboard.billing")     },
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
      <main style={{ background: "var(--cr-paper)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "60px 24px" }}>
        <div style={{ width: 56, height: 56, borderRadius: "4px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
          <LayoutGrid style={{ width: 24, height: 24, color: "var(--cr-ink-4)" }} />
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "28px", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "12px" }}>{t("dashboard.setUpProfile")}</h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", maxWidth: "400px", marginBottom: "28px" }}>
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
            <div className="ruled-label" style={{ marginBottom: "10px" }}>{t("dashboard.startupDashboard")}</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(26px, 4vw, 34px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "10px" }}>
              {startup.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <StatusBadge status={startup.status} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>
                {t("dashboard.tier", { tier })}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href={`/startups/${startup.slug}`} target="_blank" style={outlineBtn}>
              <ExternalLink style={{ width: 12, height: 12 }} /> {t("dashboard.viewListing")}
            </Link>
            {/* The unlocked owner view above lies by omission: it never shows
                what a real investor meets. This one does — tier zeroed,
                documents locked, upgrade prompts visible. */}
            <Link href={`/startups/${startup.slug}?preview=investor`} target="_blank" style={outlineBtn}>
              <Eye style={{ width: 12, height: 12 }} /> {t("preview.open")}
            </Link>
            <Link href={`/startups/${startup.slug}/one-pager`} target="_blank" style={outlineBtn}>
              <FileText style={{ width: 12, height: 12 }} /> {t("onePager.open")}
            </Link>
            <Link href="/dashboard/startup/edit" style={outlineBtn}>
              <Settings style={{ width: 12, height: 12 }} /> {t("dashboard.editProfile")}
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 40px 64px" }}>

        {/* Listing status banner — one for every state, always at the top. */}
        {startup.status === "pending_review" && (
          <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(180,83,9,0.2)", borderRadius: "4px", padding: "14px 18px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle style={{ width: 16, height: 16, color: "#B45309", flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#B45309" }}>{t("dashboard.profileUnderReview")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "#92400E" }}>{t("dashboard.reviewNote")}</p>
            </div>
          </div>
        )}
        {startup.status === "draft" && rejectionReason && (
          <div style={{ background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.25)", borderRadius: "4px", padding: "14px 18px", marginBottom: "24px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <AlertCircle style={{ width: 16, height: 16, color: "var(--cr-down)", flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-down)" }}>{t("dashboard.statusRejectedTitle")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", marginTop: "4px", lineHeight: 1.5 }}>“{rejectionReason}”</p>
              <Link href="/dashboard/startup/edit" style={{ display: "inline-block", marginTop: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>{t("dashboard.editAndResubmit")} →</Link>
            </div>
          </div>
        )}
        {startup.status === "draft" && !rejectionReason && (
          <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px 18px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <AlertCircle style={{ width: 16, height: 16, color: "var(--cr-copper)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{t("dashboard.statusDraftTitle")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.statusDraftBody")}</p>
            </div>
            <Link href="/dashboard/startup/edit" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "#fff", background: "var(--cr-copper)", padding: "8px 14px", borderRadius: "4px", textDecoration: "none", whiteSpace: "nowrap" }}>{t("dashboard.submitForReview")} →</Link>
          </div>
        )}
        {startup.status === "active" && (
          <div style={{ background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", borderRadius: "4px", padding: "12px 18px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cr-up)", boxShadow: "0 0 0 4px rgba(45,106,79,0.15)", flexShrink: 0 }} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-up)", flex: 1, minWidth: 160 }}>{t("dashboard.statusLiveTitle")}</p>
            <Link href={`/startups/${startup.slug}`} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-up)", textDecoration: "none" }}>{t("dashboard.viewPublicListing")} →</Link>
          </div>
        )}
        {startup.status === "suspended" && (
          <div style={{ background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.25)", borderRadius: "4px", padding: "14px 18px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle style={{ width: 16, height: 16, color: "var(--cr-down)", flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-down)" }}>{t("dashboard.statusSuspendedTitle")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.statusSuspendedBody")}</p>
            </div>
          </div>
        )}

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "32px" }}>
          {[
            { label: t("dashboard.profileViews"), val: analytics.views,                Icon: Eye,           series: analytics.viewSeries },
            { label: t("dashboard.investorSaves"), val: analytics.saves,               Icon: Bookmark,      series: analytics.saveSeries },
            { label: t("dashboard.activeDeals"),   val: analytics.deals,               Icon: Handshake,     series: analytics.dealSeries, href: "/deals" },
            { label: t("dashboard.aiScore"),       val: startup.vaultrise_score ?? "—", Icon: TrendingUp   },
          ].map(({ label, val, Icon, series, href }: { label: string; val: number | string; Icon: typeof Eye; series?: number[]; href?: string }) => (
            <div key={label} onClick={href ? () => router.push(href) : undefined}
              role={href ? "link" : undefined} tabIndex={href ? 0 : undefined}
              onKeyDown={href ? (e) => { if (e.key === "Enter") router.push(href); } : undefined}
              style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px 18px", cursor: href ? "pointer" : "default" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
                <Icon style={{ width: 13, height: 13, color: "var(--cr-paper-4)" }} />
              </div>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "26px", color: "var(--cr-ink)" }}>{val}</p>
              {series && <ViewsSparkline series={series} />}
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: "28px", display: "flex", overflowX: "auto" }}>
          {TABS.filter(tab => tab.value !== "ai" || canGrowth).map(({ value, label }) => (
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
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "16px" }}>{t("dashboard.profileCompletion")}</h3>
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
                  <CheckCircle2 style={{ width: 14, height: 14 }} /> {t("dashboard.profileComplete")}
                </div>
              ) : (
                <>
                  {/* One instruction, not a list of eleven. The heaviest miss
                      is the one worth doing, and it says what it is worth. */}
                  {nextAction && (
                    <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "10px 12px", marginBottom: "12px" }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>
                        {t("completeness.nextBest")}
                      </p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", lineHeight: 1.4 }}>
                        {t(nextAction.labelKey)}
                      </p>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", marginTop: "3px" }}>
                        {t("completeness.worth", { points: nextAction.weight })}
                      </p>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                    {missing.slice(0, 5).map((m) => (
                      <div key={m.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Circle style={{ width: 10, height: 10, color: "var(--cr-paper-4)", flexShrink: 0 }} />
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>{t(m.labelKey)}</span>
                      </div>
                    ))}
                    {missing.length > 5 && (
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                        {t("completeness.andMore", { count: missing.length - 5 })}
                      </span>
                    )}
                  </div>
                </>
              )}
              <Link href="/dashboard/startup/edit" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "36px", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", textDecoration: "none", marginTop: "8px" }}>
                {t("dashboard.completeProfile")}
              </Link>
            </div>

            {/* Right col */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Quick actions */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px" }}>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "14px" }}>{t("dashboard.quickActions")}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    { href: "/deals",                    Icon: Handshake,     label: t("dashboard.dealPipeline") },
                    { href: "/dashboard/messages",       Icon: MessageSquare, label: t("dashboard.messages")    },
                    { href: "/dashboard/startup/edit",   Icon: Settings,      label: t("dashboard.editProfile") },
                    { href: "/dashboard/team",           Icon: Users,         label: t("team.navLabel")        },
                    { href: "/pricing",                  Icon: TrendingUp,    label: t("dashboard.upgradePlan") },
                    { href: `/startups/${startup.slug}`, Icon: ExternalLink,  label: t("dashboard.publicView"), ext: true },
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
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", textTransform: "capitalize" }}>{t("dashboard.tier", { tier })}</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>
                    {tier === "free" ? t("dashboard.upgradeTierNote") : t("dashboard.activeSubscription")}
                  </p>
                </div>
                {tier === "free"
                  ? <Link href="/pricing" style={primaryBtn}>{t("common.upgrade")}</Link>
                  : viewingAs ? null : <button onClick={openBillingPortal} style={outlineBtn}><CreditCard style={{ width: 12, height: 12 }} /> {t("dashboard.manage")}</button>}
              </div>

              {/* Profile visibility */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px" }}>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Zap style={{ width: 13, height: 13, color: "var(--cr-copper)" }} /> {t("dashboard.profileVisibility")}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {VIS_ROWS.map((row) => {
                    const unlocked = "always" in row ? true : ("key" in row && row.key === "docs" ? canDocs : canGrowth);
                    return (
                      <div key={row.labelKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {unlocked
                            ? <CheckCircle2 style={{ width: 13, height: 13, color: "var(--cr-up)", flexShrink: 0 }} />
                            : <Lock style={{ width: 13, height: 13, color: "var(--cr-ink-4)", flexShrink: 0 }} />}
                          <span data-tip={t(row.tipKey)} tabIndex={0} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: unlocked ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>{t(row.labelKey)}</span>
                        </div>
                        {!unlocked && "tier" in row && (
                          <span style={{ background: "transparent", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px" }}>
                            {row.tier}+
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {tier === "free" && (
                  <Link href="/pricing" style={{ ...primaryBtn, display: "flex", justifyContent: "center", marginTop: "16px", width: "100%", boxSizing: "border-box" }}>
                    {t("dashboard.unlockProfileInfo")}
                  </Link>
                )}
              </div>
            </div>

            {startup && startup.status === "active" && <ErrorBoundary labelKey="sections.updateComposer"><UpdateComposer /></ErrorBoundary>}
            {startup && <ErrorBoundary labelKey="sections.raiseProgress"><RoundControls startup={startup} /></ErrorBoundary>}
            {startup && analytics.funnel && (
              <ErrorBoundary labelKey="sections.raiseProgress">
                <RaiseFunnel views={analytics.views} saves={analytics.saves} deals={analytics.deals} termSheets={analytics.funnel.termSheets} closed={analytics.funnel.closed} />
              </ErrorBoundary>
            )}
            {startup && <ErrorBoundary labelKey="sections.investorInterest"><QuestionQueue /></ErrorBoundary>}
            {startup && <ErrorBoundary labelKey="sections.documentAnalytics"><NdaRoster /></ErrorBoundary>}
            {startup && analytics.raise && (
              <ErrorBoundary labelKey="sections.raiseProgress">
                <RaiseTracker target={startup.funding_target} softCircled={analytics.raise.softCircled} committed={analytics.raise.committed} />
              </ErrorBoundary>
            )}
            <ErrorBoundary labelKey="sections.fundraiseChecklist"><FundraiseChecklist startup={startup} completeness={score} /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.tractionHistory"><MetricsRecorder /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.investorInterest"><SaversPanel /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.profileViewers"><ViewersPanel /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.targetInvestors"><TargetsPanel /></ErrorBoundary>
            <ErrorBoundary labelKey="sections.documentAnalytics"><DocAnalyticsPanel /></ErrorBoundary>
          </div>
        )}

        {/* ── Documents ── */}
        {activeTab === "documents" && (
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)" }}>{t("dashboard.uploadedDocuments")}</h3>
              <Link href="/dashboard/startup/documents" style={primaryBtn}>
                <FileText style={{ width: 12, height: 12 }} /> {t("dashboard.manage")}
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
                          {t("dashboard.ndaRequired")}
                        </span>
                      )}
                    </div>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                      {t("dashboard.view")}
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>
                {t("dashboard.noDocuments")}
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
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)" }}>{t("dashboard.aiPitchFeedback")}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("dashboard.aiPitchFeedbackSub")}</p>
              </div>
            </div>
            {!aiFeedback ? (
              viewingAs ? null : (
                <button onClick={generatePitchFeedback} disabled={loadingFeedback} style={{ ...primaryBtn, opacity: loadingFeedback ? 0.6 : 1 }}>
                  {loadingFeedback ? t("dashboard.analyzing") : t("dashboard.generateFeedback")}
                </button>
              )
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "20px" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "40px", color: "var(--cr-copper)", lineHeight: 1 }}>{aiFeedback.overall_score}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "18px", color: "var(--cr-ink-4)" }}>/100</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                  {[
                    { key: "clarity",                 label: t("dashboard.fbClarity")     },
                    { key: "market_sizing",           label: t("dashboard.fbMarket")      },
                    { key: "competitive_positioning", label: t("dashboard.fbCompetitive") },
                    { key: "missing_information",     label: t("dashboard.fbMissing")     },
                  ].map(({ key, label }) => (
                    <div key={key} style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "16px 18px" }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>{label}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiFeedback[key]}</p>
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
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
            <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)", marginBottom: "20px" }}>{t("dashboard.subscriptionBilling")}</h3>
            <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px 18px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", textTransform: "capitalize" }}>{t("dashboard.tier", { tier })}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{profile.subscription_status || t("dashboard.statusActive")}</p>
              </div>
              {viewingAs ? null : (
                <button onClick={openBillingPortal} style={outlineBtn}>
                  <CreditCard style={{ width: 12, height: 12 }} /> {t("dashboard.manageBilling")}
                </button>
              )}
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", lineHeight: 1.7 }}>
              {t("dashboard.billingNote")}
            </p>
          </div>
        )}

        {/* F: a founder's best introduction is the investor who passed on
            them politely. Hidden when an admin is viewing as this founder —
            an invite is theirs to send, not ours. */}
        {!viewingAs && (
          <div style={{ marginTop: "24px" }}>
            <InvitePanel defaultRole="investor" />
          </div>
        )}
      </div>
    </main>
  );
}
