"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Bookmark, Brain, CheckCircle2, Circle, CreditCard, Crosshair, ExternalLink, Eye, FileText, LayoutGrid, Lock, MessageSquare, Settings, TrendingUp, Users, Zap } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Profile, Startup } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { notify } from "@/components/ui/toast-notify";
import { listingCompleteness } from "@/lib/listing-completeness";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  profile:      Profile;
  startup:      Startup | null;
  analytics:    { views: number; saves: number; deals: number; viewSeries?: number[]; raise?: { softCircled: number; committed: number } };
  isLaunchMode: boolean;
  /**
   * Set when an admin is looking at someone else's dashboard. Carries the
   * founder's name for the banner, and switches every mutating control off --
   * an admin must not be able to start an AI job or open a billing portal
   * against an account that is not theirs just by clicking around.
   */
  viewingAs?: string;
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
  { labelKey: "dashboard.visName",       always: true },
  { labelKey: "dashboard.visTeam",       tier: "Starter", key: "docs" },
  { labelKey: "dashboard.visDeck",       tier: "Starter", key: "docs" },
  { labelKey: "dashboard.visMessaging",  tier: "Starter", key: "docs" },
  { labelKey: "dashboard.visFinancials", tier: "Growth",  key: "growth" },
  { labelKey: "dashboard.visDemo",       tier: "Growth",  key: "growth" },
  { labelKey: "dashboard.visAiScore",    tier: "Growth",  key: "growth" },
  { labelKey: "dashboard.visFeatured",   tier: "Growth",  key: "growth" },
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

/** The raise's other direction: investors this startup is pursuing. */
function TargetsPanel() {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<Array<{ id: string; slug: string; name: string | null; firm: string | null; note: string | null; status: string; investorId?: string }> | null>(null);
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
              {tg.note && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{tg.note}</span>
              )}
            </Link>
            <button
              onClick={async () => {
                const next = STATUS_ORDER[(STATUS_ORDER.indexOf(tg.status as typeof STATUS_ORDER[number]) + 1) % STATUS_ORDER.length];
                setTargets((prev) => prev?.map(x => x.id === tg.id ? { ...x, status: next } : x) ?? prev);
                await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId: tg.investorId, status: next }) });
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
  const [busy, setBusy] = useState(false);

  async function publish() {
    if (busy || !title.trim() || !body.trim()) return;
    setBusy(true);
    const res = await fetch("/api/updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body }) });
    setBusy(false);
    if (!res.ok) { notify.error(t("dashboard.updFailed")); return; }
    notify.success(t("dashboard.updPosted"));
    setTitle(""); setBody(""); setOpen(false);
  }

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

export function StartupDashboardClient({ profile, startup, analytics, isLaunchMode, viewingAs }: Props) {
  const { t }        = useTranslation();
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
    const res = await fetch("/api/ai/pitch-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId: startup.id }) });
    setAiFeedback(await res.json());
    setLoadingFeedback(false);
  }

  async function openBillingPortal() {
    if (viewingAs) return;
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
            <Link href="/dashboard/startup/edit" style={outlineBtn}>
              <Settings style={{ width: 12, height: 12 }} /> {t("dashboard.editProfile")}
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
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#B45309" }}>{t("dashboard.profileUnderReview")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "#92400E" }}>{t("dashboard.reviewNote")}</p>
            </div>
          </div>
        )}

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "32px" }}>
          {[
            { label: t("dashboard.profileViews"), val: analytics.views,                Icon: Eye,           series: analytics.viewSeries },
            { label: t("dashboard.investorSaves"), val: analytics.saves,               Icon: Bookmark      },
            { label: t("dashboard.activeDeals"),   val: analytics.deals,               Icon: MessageSquare },
            { label: t("dashboard.aiScore"),       val: startup.vaultrise_score ?? "—", Icon: TrendingUp   },
          ].map(({ label, val, Icon, series }: { label: string; val: number | string; Icon: typeof Eye; series?: number[] }) => (
            <div key={label} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px 18px" }}>
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
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: unlocked ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>{t(row.labelKey)}</span>
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

            {startup && startup.status === "active" && <ErrorBoundary label="Update composer"><UpdateComposer /></ErrorBoundary>}
            {startup && analytics.raise && (
              <ErrorBoundary label="Raise progress">
                <RaiseTracker target={startup.funding_target} softCircled={analytics.raise.softCircled} committed={analytics.raise.committed} />
              </ErrorBoundary>
            )}
            <ErrorBoundary label="Investor interest"><SaversPanel /></ErrorBoundary>
            <ErrorBoundary label="Profile viewers"><ViewersPanel /></ErrorBoundary>
            <ErrorBoundary label="Target investors"><TargetsPanel /></ErrorBoundary>
            <ErrorBoundary label="Document analytics"><DocAnalyticsPanel /></ErrorBoundary>
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
      </div>
    </main>
  );
}
