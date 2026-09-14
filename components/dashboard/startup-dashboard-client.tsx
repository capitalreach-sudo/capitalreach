"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Profile, Startup } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { useMessagingAvailable } from "@/hooks/useMessagingAvailable";
import { InvitePanel } from "@/components/shared/invite-panel";
import { InfoTip } from "@/components/shared/info-tip";
import { ShareLinks } from "@/components/startup/share-links";
import type { BenchmarkResult } from "@/lib/benchmarks";
import { CapTableCard } from "@/components/dashboard/cap-table-card";
import { Sparkline } from "@/components/ui/sparkline";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/toast-notify";
import { listingCompleteness } from "@/lib/listing-completeness";
import { MetricsRecorder } from "@/components/dashboard/metrics-recorder";
import { FundraiseChecklist } from "@/components/dashboard/fundraise-checklist";
import { FounderAttestationModal } from "@/components/review/FounderAttestationModal";
import { RoleSwitchLink } from "@/components/shared/role-switch-link";
import { ReadOnlyProvider } from "@/components/dashboard/read-only";
import { PageHeader } from "@/components/ui/page-header";
import { Ledger, LedgerCell, LedgerRow, Section } from "@/components/ui/ledger";

/* Hallmark · component: founder dashboard · genre: modern-minimal · theme: project registers
 * states: default · hover · focus · active · disabled · loading · error
 * One column of sections in job order: stage, next steps, round, investors,
 * documents, pitch feedback. A section renders only when it has rows.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  profile:      Profile;
  startup:      Startup | null;
  /**
   * The three figures the Investors section words, the 30-day view trend
   * behind the headline, the round's money, and the all-time funnel (B25)
   * that reads views through to a closed deal on one shared definition.
   */
  analytics:    {
    views: number; saves: number; deals: number;
    viewSeries?: number[];
    raise?: { softCircled: number; committed: number };
    funnel?: { views: number; deals: number; termSheets: number; closed: number };
  };
  isLaunchMode: boolean;
  /**
   * Set when an admin is looking at someone else's dashboard. Carries the
   * founder's name for the banner, and switches every mutating control off:
   * an admin must not be able to start an AI job, answer a question or post
   * an update against an account that is not theirs just by clicking around.
   */
  viewingAs?: string;
  /** Latest admin rejection reason still in force (draft listings only). */
  rejectionReason?: string | null;
  needsClosureDeclaration?: boolean;
  /** F10: percentiles against same-stage live listings; null when the cohort is too small. */
  benchmarks?: BenchmarkResult | null;
}

type Vars = Record<string, string | number>;

// ── Strings ───────────────────────────────────────────────────────────────────

/**
 * t() echoes an unknown key back, so a key the dictionaries do not carry yet
 * renders its English fallback instead. tp picks the English plural by count;
 * once the key exists, t() does the CLDR selection itself.
 */
function useTf() {
  const { t, locale } = useTranslation();
  const fill = (s: string, vars?: Vars) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`));
  const tf = (key: string, fallback: string, vars?: Vars) => {
    const out = t(key, vars);
    return out === key ? fill(fallback, vars) : out;
  };
  const tp = (key: string, one: string, other: string, count: number, vars?: Vars) => {
    const all = { ...vars, count };
    const out = t(key, all);
    return out === key ? fill(count === 1 ? one : other, all) : out;
  };
  return { t, tf, tp, locale };
}

/** Sets the first occurrence of a number inside a translated sentence in the figure face. */
function withFigure(text: string, value: number | string): ReactNode {
  const s = String(value);
  const at = text.indexOf(s);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="sd-fig">{s}</span>
      {text.slice(at + s.length)}
    </>
  );
}

/**
 * Normalises a raw daily series into the 0..1 points Sparkline draws. A trend
 * needs 8+ measurements to read as a shape rather than a squiggle, and an
 * all-zero window has no slope to show -- both render nothing rather than a
 * flat or near-empty line.
 */
function trendPoints(series?: number[]): number[] | null {
  if (!series || series.length < 8) return null;
  const max = Math.max(...series);
  if (max === 0) return null;
  return series.map((v) => v / max);
}

/** Locale list punctuation around React nodes ("a, b, c" in English). */
function joinList(items: ReactNode[], locale: string): ReactNode {
  if (items.length <= 1) return items[0] ?? null;
  try {
    const parts = new Intl.ListFormat(locale, { style: "short", type: "unit" })
      .formatToParts(items.map((_, i) => String(i)));
    return parts.map((p, i) => (
      <span key={i}>{p.type === "element" ? items[Number(p.value)] : p.value}</span>
    ));
  } catch {
    return items.map((item, i) => <span key={i}>{i > 0 ? ", " : null}{item}</span>);
  }
}

// Same labels the directories use for this column. Rendered raw, "vc" reads
// as "Vc" and "family_office" as "Family office" -- route through the keys
// instead (components/shared/deal-kanban.tsx hit the same thing first).
const INVESTOR_TYPE_KEYS: Record<string, string> = {
  angel: "investors.typeAngel",
  vc: "investors.typeVc",
  family_office: "investors.typeFamilyOffice",
  corporate: "investors.typeCorporate",
};

const STATUS_KEYS: Record<string, string> = {
  active:         "dashboard.statusActive",
  pending_review: "dashboard.statusPendingReview",
  suspended:      "dashboard.statusSuspended",
  draft:          "dashboard.statusDraft",
};

const sentenceCase = (s: string) => {
  const flat = s.replace(/_/g, " ");
  return flat.charAt(0).toUpperCase() + flat.slice(1);
};

// Undo window for reversible deletes. The request is sent when it closes.
const UNDO_MS = 6000;

// ── Styles ────────────────────────────────────────────────────────────────────

// Container geometry is shared with app/dashboard/startup/loading.tsx.
const CONTAINER: React.CSSProperties = {
  maxWidth: "68.75rem",
  marginInline: "auto",
  paddingInline: "clamp(1rem, 4vw, 2rem)",
  paddingBlockEnd: "4rem",
};

// Scoped to this surface. Buttons, fields, rows and chips come from the
// LEDGER SYSTEM classes in app/globals.css; these rules only compose them.
// The children this page mounts are styled by this block too and are used
// nowhere else: MetricsRecorder and ShareLinks need .sd-group, .sd-expandable,
// .sd-span, .sd-form and .sd-check; CapTableCard needs .sd-group. InvitePanel
// also mounts on the investor dashboard, so it carries its own layout.
const STYLES = `
.sd-page { background-color: var(--cr-paper); min-height: 100vh; }
.sd-fig {
  font-family: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--cr-ink-2);
}
.sd-sections { display: flex; flex-direction: column; gap: 3rem; }
.sd-sections > .cr-section.cr-section { margin-block-start: 0; }

.sd-banner {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
  column-gap: 1rem; row-gap: 0.25rem;
  min-height: 2.75rem;
  padding-block: 0.25rem;
  padding-inline: clamp(1rem, 4vw, 2rem);
  background-color: var(--cr-ink);
  color: var(--cr-paper);
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem; line-height: 1.4;
}
.sd-banner a {
  display: inline-flex; align-items: center; min-height: 2.75rem;
  color: var(--cr-paper); font-weight: 600;
  text-decoration-line: underline; text-decoration-thickness: 1px; text-underline-offset: 3px;
}
@media (hover: hover) { .sd-banner a:hover { text-decoration-thickness: 2px; } }
.sd-banner a:active { text-decoration-thickness: 2px; }
.sd-banner a:focus-visible { outline: 2px solid var(--cr-copper) !important; outline-offset: 2px; box-shadow: none !important; }

.sd-stage {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  column-gap: 1.5rem; row-gap: 0.75rem;
  min-height: 3.5rem;
  padding-block: 0.75rem;
  margin-block-end: 3rem;
  border-block-end: 1px solid var(--cr-rule);
}
.sd-stage__main { flex: 1 1 18rem; min-width: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.sd-steps {
  display: flex; flex-wrap: wrap; align-items: center;
  column-gap: 0.75rem; row-gap: 0.25rem;
  margin: 0; padding: 0; list-style: none;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem; font-weight: 400; line-height: 1.4;
  color: var(--cr-ink-3);
}
.sd-steps > li { display: inline-flex; align-items: center; gap: 0.75rem; white-space: nowrap; }
.sd-steps > li + li::before {
  content: ""; display: inline-block; inline-size: 0.75rem; block-size: 1px;
  background-color: var(--cr-rule-dark);
}
.sd-steps > li[aria-current="step"] { color: var(--cr-ink); font-weight: 600; }

.sd-note {
  margin: 0; max-width: 60ch;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem; font-weight: 400; line-height: 1.4;
  color: var(--cr-ink-3);
}
.sd-note[data-tone="down"] { color: var(--cr-down); }
.sd-line {
  margin: 0; max-width: 60ch;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.9375rem; font-weight: 400; line-height: 1.55;
  color: var(--cr-ink-2);
}
.sd-date {
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem; line-height: 1.4;
  color: var(--cr-ink-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sd-body {
  margin: 0.25rem 0 0; max-width: 70ch;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.9375rem; font-weight: 400; line-height: 1.55;
  color: var(--cr-ink-2);
  white-space: pre-wrap;
}
.cr-row-sub.sd-wrap { white-space: normal; }

.sd-group + .sd-group,
.cr-ledger + .sd-group,
.sd-group + .cr-ledger { margin-block-start: 1.5rem; }
.sd-group__head {
  display: flex; flex-wrap: wrap; align-items: baseline;
  column-gap: 0.75rem; row-gap: 0.25rem;
  padding-block: 0.75rem 0.25rem;
}
.sd-group__title {
  margin: 0;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.9375rem; font-weight: 600; font-style: normal;
  line-height: 1.4; letter-spacing: 0;
  color: var(--cr-ink);
}

.sd-round {
  display: flex; flex-direction: column; gap: 0.5rem;
  padding-block: 1rem;
  border-block-end: 1px solid var(--cr-rule);
}
.sd-lead {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1.75rem; font-weight: 600; font-style: normal;
  line-height: 1.2; letter-spacing: -0.02em;
  color: var(--cr-ink);
  font-variant-numeric: tabular-nums;
  font-optical-sizing: auto;
  font-variation-settings: 'SOFT' 0, 'WONK' 0;
  overflow-wrap: anywhere;
}
.sd-bar {
  display: flex;
  block-size: 0.25rem; max-inline-size: 32rem;
  margin-block-start: 0.25rem;
  overflow: hidden;
  border-radius: 999px;
  background-color: var(--cr-rule);
}
.sd-bar > span { display: block; block-size: 100%; }
.sd-bar__committed { background-color: var(--cr-up); }
.sd-bar__soft { background-color: var(--cr-ink-4); }

/* B25 raise funnel: one row per step, a copper bar for the count and the
   conversion off the step before it. Only the last step (closed, money that
   actually landed) reads as --cr-up -- the same "green is landed, copper is
   in motion" split RoundFigure's bar already uses. */
.sd-funnel { display: grid; gap: 0.625rem; padding-block: 0.75rem 0.25rem; }
.sd-funnel__row {
  display: grid;
  grid-template-columns: minmax(3.75rem, auto) minmax(0, 1fr) 3rem 2.25rem;
  align-items: center;
  gap: 0.5rem;
}
.sd-funnel__label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem; font-weight: 400; line-height: 1.4;
  color: var(--cr-ink-3);
}
.sd-funnel__bar {
  display: block; block-size: 0.375rem; overflow: hidden;
  border-radius: 999px; background-color: var(--cr-rule);
}
.sd-funnel__fill { display: block; block-size: 100%; background-color: var(--cr-copper); opacity: 0.75; }
.sd-funnel__fill[data-final] { background-color: var(--cr-up); opacity: 1; }
.sd-funnel__value { font-size: 0.8125rem; text-align: end; }
.sd-funnel__conv {
  font-family: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace;
  font-size: 0.75rem; line-height: 1.4;
  color: var(--cr-ink-4);
  font-variant-numeric: tabular-nums;
  text-align: end;
}

/* Rows that open in place: the trailing control keeps line one, the opened
   content takes a full-width line under it. */
.sd-expandable > .cr-cell--trailing { grid-row: 1; grid-column: -2 / -1; }
.sd-expandable > .sd-span { grid-row: 2; grid-column: 1 / -1; }

.sd-form { display: grid; gap: 0.75rem; max-inline-size: 40rem; padding-block: 0.75rem 0.25rem; }
.sd-form__row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.sd-form__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; }
.sd-check {
  display: inline-flex; align-items: center; gap: 0.5rem;
  min-height: 2.75rem;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem; line-height: 1.4;
  color: var(--cr-ink-2);
  cursor: pointer;
}
.sd-hit { display: inline-grid; place-items: center; min-inline-size: 2.75rem; min-block-size: 2.75rem; cursor: pointer; }
.sd-check input, .sd-hit input { inline-size: 1rem; block-size: 1rem; margin: 0; accent-color: var(--cr-ink); cursor: inherit; }
.sd-check input:focus-visible, .sd-hit input:focus-visible { outline: 2px solid var(--cr-copper) !important; outline-offset: 2px; box-shadow: none !important; }
.sd-check input:disabled, .sd-hit input:disabled { cursor: not-allowed; }

.sd-do { display: inline-flex; align-items: center; min-block-size: 2.75rem; font-size: 0.8125rem; white-space: nowrap; }

/* Two trailing controls (edit and delete, status and remove) must fall onto a
   second line at 320px rather than push the row wider than the viewport. */
.sd-page .cr-cell--trailing { flex-wrap: wrap; justify-content: flex-end; }

/* Anchor targets inside a section clear the sticky navbar the way .cr-section
   does. */
.sd-anchor { scroll-margin-block-start: calc(var(--cr-sticky-top) + 1rem); }

/* Below md every cell but the primary, the first figure and the trailing
   control stacks full width, so a date that aligns to the end on desktop
   would sit alone against the far edge. Stacked cells read from the start. */
@media (max-width: 767px) {
  .sd-page .cr-row > .cr-cell--end:not(.cr-cell--trailing) { text-align: start; }
}

.sd-foot { margin-block-start: 4rem; padding-block-start: 0.75rem; border-block-start: 1px solid var(--cr-rule); }
`;

// ── Deferred delete ───────────────────────────────────────────────────────────

/**
 * Reversible deletes: the row turns into an Undo line at once and the
 * request is sent when the window closes. A failed request brings the row
 * back with an error. Leaving the page sends whatever is still pending.
 */
function useDeferredDelete(send: (id: string) => Promise<boolean>, onGone: (id: string) => void) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const sendRef = useRef(send);
  const goneRef = useRef(onGone);
  sendRef.current = send;
  goneRef.current = onGone;

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer, id) => {
        clearTimeout(timer);
        void sendRef.current(id);
      });
      map.clear();
    };
  }, []);

  function remove(id: string) {
    if (timers.current.has(id)) return;
    setPending((p) => [...p, id]);
    timers.current.set(id, setTimeout(async () => {
      timers.current.delete(id);
      const ok = await sendRef.current(id).catch(() => false);
      if (ok) goneRef.current(id);
      else notify.error(t("errors.generic"));
      setPending((p) => p.filter((x) => x !== id));
    }, UNDO_MS));
  }

  function undo(id: string) {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setPending((p) => p.filter((x) => x !== id));
  }

  return { pending, remove, undo };
}

// ── Stage row ─────────────────────────────────────────────────────────────────

/**
 * The queue re-entry. Saving an edit never changes status, so a draft (and
 * every rejected listing, which rejection sets back to draft) reaches the
 * review queue only through this button.
 */
function SubmitForReviewButton() {
  const router = useRouter();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/startups/submit", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) { notify.error(t("errors.generic")); return; }
    router.refresh();
  }
  return (
    <button type="button" onClick={submit} disabled={busy} aria-busy={busy || undefined} className="cr-btn cr-btn--primary">
      {busy ? t("dashboard.submitting") : t("dashboard.submitForReview")}
    </button>
  );
}

/**
 * Draft, In review, Live, Round closed on one hairline row, with the one
 * action the stage asks for. The closure declaration outranks every other
 * action: a closed round without it is the moment the platform's fee is
 * either claimed or quietly leaks.
 */
function StageRow({ startup, rejectionReason, needsClosureDeclaration, readOnly }: {
  startup: Startup;
  rejectionReason: string | null;
  needsClosureDeclaration: boolean;
  readOnly: boolean;
}) {
  const { t, tf } = useTf();
  const status = startup.status as string;
  const roundClosed = startup.round_state === "closed";
  const current = status === "draft" ? 0 : status === "pending_review" ? 1 : status === "active" && roundClosed ? 3 : 2;
  const steps = [
    t("dashboard.statusDraft"),
    tf("dashboard.startup.stageReview", "In review"),
    status === "suspended" ? t("dashboard.statusSuspended") : tf("dashboard.startup.stageLive", "Live"),
    t("startupDetail.round_closed"),
  ];

  let action: ReactNode = null;
  if (!readOnly) {
    if (needsClosureDeclaration) {
      action = <Link href="/dashboard/startup/close-round" className="cr-btn cr-btn--primary">{t("dashboard.declareClosure")}</Link>;
    } else if (status === "draft") {
      action = <SubmitForReviewButton />;
    } else if (status === "active" && !roundClosed) {
      action = <a href="#share" className="cr-btn cr-btn--primary">{tf("dashboard.startup.shareRound", "Share your round")}</a>;
    }
  }

  let note: ReactNode = null;
  if (needsClosureDeclaration) {
    note = <p className="sd-note">{t("dashboard.closureDeclarationDue")}</p>;
  } else if (status === "draft" && rejectionReason) {
    note = <p className="sd-note" data-tone="down">{t("dashboard.statusRejectedTitle")}: “{rejectionReason}”</p>;
  } else if (status === "draft") {
    note = <p className="sd-note">{t("dashboard.statusDraftBody")}</p>;
  } else if (status === "pending_review") {
    note = <p className="sd-note">{t("dashboard.reviewNote")}</p>;
  } else if (status === "suspended") {
    note = <p className="sd-note" data-tone="down">{t("dashboard.statusSuspendedTitle")}. {t("dashboard.statusSuspendedBody")}</p>;
  }

  return (
    <div className="sd-stage">
      <div className="sd-stage__main">
        <ol className="sd-steps" aria-label={tf("dashboard.startup.stageLabel", "Listing stage")}>
          {steps.map((label, i) => (
            <li key={i} aria-current={i === current ? "step" : undefined}>{label}</li>
          ))}
        </ol>
        {note}
      </div>
      {action}
    </div>
  );
}

// ── Round ─────────────────────────────────────────────────────────────────────

function RoundFigure({ target, committed, softCircled }: { target: number; committed: number; softCircled: number }) {
  const { tf } = useTf();
  const fmt = (n: number) => formatCurrency(n, true);
  const total = committed + softCircled;
  const pctC = Math.min(100, (committed / target) * 100);
  const pctS = Math.min(100 - pctC, (softCircled / target) * 100);
  const lead = committed > 0
    ? tf("dashboard.startup.roundCommitted", "{committed} of {target} committed", { committed: fmt(committed), target: fmt(target) })
    : tf("dashboard.startup.roundNothingCommitted", "Nothing committed yet toward {target}.", { target: fmt(target) });
  const soft = softCircled > 0
    ? tf("dashboard.startup.roundSoftCircled", "{amount} soft-circled", { amount: fmt(softCircled) })
    : null;
  return (
    <div className="sd-round">
      {committed > 0 ? <p className="sd-lead">{lead}</p> : <p className="sd-line">{lead}</p>}
      {soft && <p className="sd-note">{soft}</p>}
      {total > 0 && (
        <div className="sd-bar" role="img" aria-label={[lead, soft].filter(Boolean).join(". ")}>
          <span className="sd-bar__committed" style={{ inlineSize: `${pctC}%` }} />
          <span className="sd-bar__soft" style={{ inlineSize: `${pctS}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * B16 + B19: the founder's own levers on a live round. Round state is separate
 * from admin moderation; closing it answers with the closure declaration,
 * which this hands straight to /dashboard/startup/close-round.
 */
function RoundControls({ startup, readOnly }: { startup: Startup; readOnly: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [state, setState] = useState<string>(startup.round_state ?? "open");
  const [momentum, setMomentum] = useState<boolean>(!!startup.show_momentum);
  const [busy, setBusy] = useState(false);
  const selectId = useId();
  const momentumId = useId();
  const hintId = useId();
  const STATES: Array<[string, string]> = [
    ["open", t("startupDetail.round_open")],
    ["oversubscribed", t("startupDetail.round_oversubscribed")],
    ["paused", t("startupDetail.round_paused")],
    ["closed", t("startupDetail.round_closed")],
  ];
  const known = STATES.some(([v]) => v === state);

  async function save(patch: { roundState?: string; showMomentum?: boolean }) {
    const prev = { state, momentum };
    if (patch.roundState) setState(patch.roundState);
    if (patch.showMomentum !== undefined) setMomentum(patch.showMomentum);
    setBusy(true);
    const res = await fetch("/api/startups/round-state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setState(prev.state);
      setMomentum(prev.momentum);
      notify.error(t("errors.generic"));
      return;
    }
    // The API answers a close by asking for the closure declaration; the
    // declaration page has no other inbound path at the moment of closing.
    const body = await res.json().catch(() => null) as { closureDeclaration?: { required?: boolean; declaredAt?: string | null } } | null;
    if (body?.closureDeclaration?.required && !body.closureDeclaration.declaredAt) {
      router.push("/dashboard/startup/close-round");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <LedgerRow>
        <LedgerCell primary>
          {readOnly
            ? <span className="cr-row-title">{t("dashboard.roundStatusTitle")}</span>
            : <label htmlFor={selectId} className="cr-row-title">{t("dashboard.roundStatusTitle")}</label>}
          {known && <span className="cr-row-sub sd-wrap">{t(`dashboard.roundHelp_${state}`)}</span>}
        </LedgerCell>
        <LedgerCell />
        {readOnly ? (
          <LedgerCell align="end">
            <span className="sd-date">{STATES.find(([v]) => v === state)?.[1] ?? sentenceCase(state)}</span>
          </LedgerCell>
        ) : (
          <LedgerCell align="end">
            <select
              id={selectId}
              className="cr-select"
              value={state}
              disabled={busy}
              aria-busy={busy || undefined}
              onChange={(e) => { if (e.target.value !== state) void save({ roundState: e.target.value }); }}
            >
              {STATES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </LedgerCell>
        )}
      </LedgerRow>
      <LedgerRow>
        <LedgerCell primary>
          <span id={momentumId} className="cr-row-title">{t("dashboard.momentumToggle")}</span>
          <span id={hintId} className="cr-row-sub sd-wrap">{t("dashboard.momentumHint")}</span>
        </LedgerCell>
        <LedgerCell />
        <LedgerCell align="end">
          {readOnly ? (
            <span className="sd-date">{momentum ? t("common.yes") : t("common.no")}</span>
          ) : (
            <label className="sd-hit">
              <input
                type="checkbox"
                checked={momentum}
                disabled={busy}
                aria-labelledby={momentumId}
                aria-describedby={hintId}
                onChange={(e) => void save({ showMomentum: e.target.checked })}
              />
            </label>
          )}
        </LedgerCell>
      </LedgerRow>
    </>
  );
}

/**
 * B25: the raise funnel from tables that already exist -- views through to a
 * closed deal, one all-time definition per step so no step can read over
 * 100% against the one before it. `views` and `deals` here are the funnel's
 * own all-time counts, not the 30-day / active-only figures the rest of the
 * page words -- a mixed definition either overflows a conversion percentage
 * or narrows the funnel to zero before Closed.
 */
function RoundFunnel({ views, saves, deals, termSheets, closed }: {
  views: number; saves: number; deals: number; termSheets: number; closed: number;
}) {
  const { t } = useTf();
  if (views === 0 && deals === 0) return null;
  const steps: Array<[string, number]> = [
    [t("dashboard.funnelViews"), views],
    [t("dashboard.funnelSaves"), saves],
    [t("dashboard.funnelDeals"), deals],
    [t("dashboard.funnelTermSheets"), termSheets],
    [t("dashboard.funnelClosed"), closed],
  ];
  const max = Math.max(1, ...steps.map(([, v]) => v));
  return (
    <div className="sd-group">
      <div className="sd-group__head">
        <h3 className="sd-group__title">{t("dashboard.funnelTitle")}</h3>
        <span className="sd-note" style={{ marginInlineStart: "auto" }}>{t("dashboard.funnelWindow")}</span>
      </div>
      <div className="sd-funnel">
        {steps.map(([label, v], i) => {
          const prev = i > 0 ? steps[i - 1][1] : null;
          const conv = prev && prev > 0 ? Math.round((v / prev) * 100) : null;
          return (
            <div key={label} className="sd-funnel__row">
              <span className="sd-funnel__label">{label}</span>
              <span className="sd-funnel__bar">
                <span className="sd-funnel__fill" data-final={i === steps.length - 1 || undefined} style={{ inlineSize: `${(v / max) * 100}%` }} />
              </span>
              <span className="sd-fig sd-funnel__value">{v.toLocaleString()}</span>
              <span className="sd-funnel__conv">{conv !== null ? `${conv}%` : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoundSection({ startup, raise, deals, saves, funnel, benchmarks, readOnly }: {
  startup: Startup;
  raise: { softCircled: number; committed: number };
  deals: number;
  saves: number;
  funnel: { views: number; deals: number; termSheets: number; closed: number } | null;
  benchmarks: BenchmarkResult | null;
  readOnly: boolean;
}) {
  const { t, tf } = useTf();
  // formatCurrency refuses implausible amounts; such a target counts as unset.
  const target = startup.funding_target > 0 && formatCurrency(startup.funding_target, true) !== "—" ? startup.funding_target : 0;
  const live = startup.status === "active";
  if (!target && !live && deals === 0 && readOnly) return null;
  const showBench = !!benchmarks && benchmarks.cohortSize >= 5 && benchmarks.entries.length > 0;

  return (
    <Section id="round" title={target || live ? tf("dashboard.startup.round", "Round") : t("traction.title")}>
      {target > 0 && (
        <ErrorBoundary labelKey="sections.raiseProgress">
          <RoundFigure target={target} committed={raise.committed} softCircled={raise.softCircled} />
        </ErrorBoundary>
      )}
      {(live || deals > 0) && (
        <ErrorBoundary labelKey="sections.raiseProgress">
          <Ledger columns="minmax(0,1fr) auto auto">
            {live && <RoundControls startup={startup} readOnly={readOnly} />}
            {deals > 0 && (
              <LedgerRow href="/deals" label={tf("dashboard.startup.dealsInProgress", "Deals in progress")}>
                <LedgerCell primary><span className="cr-row-title">{tf("dashboard.startup.dealsInProgress", "Deals in progress")}</span></LedgerCell>
                <LedgerCell figure>{deals}</LedgerCell>
              </LedgerRow>
            )}
          </Ledger>
        </ErrorBoundary>
      )}
      {funnel && (
        <ErrorBoundary labelKey="sections.raiseProgress">
          <RoundFunnel views={funnel.views} saves={saves} deals={funnel.deals} termSheets={funnel.termSheets} closed={funnel.closed} />
        </ErrorBoundary>
      )}
      {!readOnly && (
        <ErrorBoundary labelKey="sections.tractionHistory">
          <MetricsRecorder openOnHash="#round" />
        </ErrorBoundary>
      )}
      {showBench && benchmarks && (
        <div className="sd-group">
          <div className="sd-group__head">
            <h3 className="sd-group__title">{t("bench.title", { n: benchmarks.cohortSize })}</h3>
          </div>
          <Ledger columns="minmax(0,1fr) auto">
            {benchmarks.entries.map((e) => (
              <LedgerRow key={e.key}>
                <LedgerCell primary>
                  <span className="cr-row-title">{t(`bench.metric.${e.key}`)}</span>
                  <span className="cr-row-sub">{t("bench.ofPeers", { n: e.peers })}</span>
                </LedgerCell>
                <LedgerCell figure>{`p${e.percentile}`}</LedgerCell>
              </LedgerRow>
            ))}
          </Ledger>
          <p className="cr-footnote">{t("bench.explain")}</p>
        </div>
      )}
      <CapTableCard />
    </Section>
  );
}

// ── Investors ─────────────────────────────────────────────────────────────────

type Named = { slug: string; name: string | null; firm: string | null };
type SaversData = { savers: Array<Named & { savedAt: string }>; count: number; locked: boolean };
type ViewersData = { viewers: Array<Named & { lastViewedAt: string }>; count: number; locked: boolean };
type Question = {
  id: string; question: string; answer: string | null; answered_at: string | null; is_private: boolean; created_at: string;
  investor: { slug: string; display_name: string | null; firm_name: string | null } | null;
};
type Target = { id: string; slug: string; name: string | null; firm: string | null; note: string | null; status: string; investorId?: string; nextContactAt?: string | null };
type Interest = Named & { savedAt: string | null; viewedAt: string | null };

/** Savers and 30-day viewers as one row per investor, newest activity first. */
function mergeInterest(savers: SaversData["savers"], viewers: ViewersData["viewers"]): Interest[] {
  const map = new Map<string, Interest>();
  for (const s of savers) map.set(s.slug, { slug: s.slug, name: s.name, firm: s.firm, savedAt: s.savedAt, viewedAt: null });
  for (const v of viewers) {
    const row = map.get(v.slug);
    if (row) row.viewedAt = v.lastViewedAt;
    else map.set(v.slug, { slug: v.slug, name: v.name, firm: v.firm, savedAt: null, viewedAt: v.lastViewedAt });
  }
  const latest = (r: Interest) => Math.max(r.savedAt ? Date.parse(r.savedAt) : 0, r.viewedAt ? Date.parse(r.viewedAt) : 0);
  return Array.from(map.values()).sort((a, b) => latest(b) - latest(a));
}

/** B20: an open question, answered in place. */
function QuestionRow({ q, readOnly, onAnswered }: { q: Question; readOnly: boolean; onAnswered: (id: string, answer: string, priv: boolean) => void }) {
  const { t, tf } = useTf();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const who = q.investor?.display_name || q.investor?.firm_name || t("deals.investorFallback");

  async function send() {
    if (busy || !answer.trim()) return;
    setBusy(true);
    const res = await fetch("/api/questions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id, answer, isPrivate: priv }) }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) { notify.error(t("errors.generic")); return; }
    onAnswered(q.id, answer, priv);
  }

  return (
    <LedgerRow
      className="sd-expandable"
      trailing={readOnly ? undefined : (
        <button type="button" className="cr-btn cr-btn--text" aria-expanded={open} aria-controls={open ? formId : undefined} onClick={() => setOpen((o) => !o)}>
          {open ? t("common.cancel") : tf("dashboard.startup.answer", "Answer")}
        </button>
      )}
    >
      <LedgerCell primary>
        <span className="cr-row-title">{q.question}</span>
        <span className="cr-row-sub">{t("startupDetail.askedBy")} {who} · {formatDate(q.created_at)}</span>
      </LedgerCell>
      <LedgerCell className={open ? "sd-span" : undefined}>
        {open && (
          <form id={formId} className="sd-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <label htmlFor={`${formId}answer`} className="sr-only">{t("startupDetail.answerPh")}</label>
            <textarea
              id={`${formId}answer`}
              className="cr-input"
              rows={3}
              maxLength={3000}
              value={answer}
              placeholder={t("startupDetail.answerPh")}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <div className="sd-form__row" style={{ justifyContent: "space-between" }}>
              <label className="sd-check">
                <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
                {t("startupDetail.answerPrivately")}
              </label>
              <button type="submit" className="cr-btn cr-btn--primary" disabled={busy || !answer.trim()} aria-busy={busy || undefined}>
                {t("startupDetail.answerSend")}
              </button>
            </div>
          </form>
        )}
      </LedgerCell>
    </LedgerRow>
  );
}

const TARGET_STATUSES = ["to_contact", "contacted", "replied", "passed"] as const;
const TARGET_LABELS: Record<string, string> = {
  to_contact: "dashboard.tsToContact",
  contacted:  "dashboard.tsContacted",
  replied:    "dashboard.tsReplied",
  passed:     "dashboard.tsPassed",
};

/** The raise's other direction: an investor this startup is pursuing (B22). */
function TargetRow({ tg, readOnly, pending, onPatch, onStatus, onRemove, onUndo }: {
  tg: Target;
  readOnly: boolean;
  pending: boolean;
  onPatch: (tg: Target, patch: { note?: string | null; nextContactAt?: string | null }) => Promise<boolean>;
  onStatus: (tg: Target, status: string) => void;
  onRemove: (tg: Target) => void;
  onUndo: (tg: Target) => void;
}) {
  const { t, tf } = useTf();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tg.note ?? "");
  const noteId = useId();
  const name = tg.name || tg.firm || t("deals.investorFallback");

  if (pending) {
    return (
      <LedgerRow trailing={<button type="button" className="cr-btn cr-btn--text" onClick={() => onUndo(tg)}>{tf("dashboard.startup.undo", "Undo")}</button>}>
        <LedgerCell primary>
          <span className="cr-row-sub" role="status">{tf("dashboard.startup.targetRemoved", "{name} removed from your targets.", { name })}</span>
        </LedgerCell>
        <LedgerCell />
      </LedgerRow>
    );
  }

  async function saveNote() {
    if (await onPatch(tg, { note: draft.trim() || null })) setEditing(false);
  }

  const cells = [
    <LedgerCell key="who" primary>
      <span className="cr-row-title">{name}</span>
      {tg.firm && tg.firm !== name && <span className="cr-row-sub">{tg.firm}</span>}
      {readOnly ? (
        tg.note ? <span className="cr-row-sub">{tg.note}</span> : null
      ) : !editing ? (
        <button
          type="button"
          className="cr-btn cr-btn--text cr-row__raised"
          style={{ marginInlineStart: "-0.5rem", maxWidth: "100%" }}
          onClick={() => { setDraft(tg.note ?? ""); setEditing(true); }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontWeight: 400, color: tg.note ? "var(--cr-ink-2)" : "var(--cr-ink-3)" }}>
            {tg.note || t("dashboard.tgNotePh")}
          </span>
        </button>
      ) : null}
    </LedgerCell>,
    editing ? (
      <LedgerCell key="edit" className="sd-span">
        <form className="sd-form" onSubmit={(e) => { e.preventDefault(); void saveNote(); }}>
          <label htmlFor={noteId} className="sr-only">{t("dashboard.addNote")}</label>
          <input
            id={noteId}
            className="cr-input"
            value={draft}
            maxLength={1000}
            placeholder={t("dashboard.tgNotePh")}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
          />
          <div className="sd-form__actions">
            <button type="button" className="cr-btn cr-btn--text" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
            <button type="submit" className="cr-btn">{t("common.save")}</button>
          </div>
        </form>
      </LedgerCell>
    ) : (
      <LedgerCell key="next" align="end">
        {readOnly ? (
          tg.nextContactAt ? <span className="sd-date">{formatDate(tg.nextContactAt)}</span> : null
        ) : (
          <input
            type="date"
            className="cr-input cr-row__raised"
            style={{ width: "auto", fontSize: "0.8125rem" }}
            aria-label={`${t("dashboard.tgNextContact")}: ${name}`}
            value={tg.nextContactAt ?? ""}
            onChange={(e) => void onPatch(tg, { nextContactAt: e.target.value || null })}
          />
        )}
      </LedgerCell>
    ),
  ];

  const trailing = readOnly ? (
    <span className="sd-date">{t(TARGET_LABELS[tg.status] ?? "dashboard.tsToContact")}</span>
  ) : (
    <>
      <select
        className="cr-select"
        value={tg.status}
        aria-label={`${t("dashboard.statusLabel")}: ${name}`}
        onChange={(e) => onStatus(tg, e.target.value)}
      >
        {TARGET_STATUSES.map((s) => <option key={s} value={s}>{t(TARGET_LABELS[s])}</option>)}
      </select>
      <button type="button" className="cr-btn cr-btn--text" onClick={() => onRemove(tg)}>{t("common.remove")}</button>
    </>
  );

  return editing
    ? <LedgerRow className="sd-expandable" trailing={trailing}>{cells}</LedgerRow>
    : <LedgerRow className="sd-expandable" href={`/investors/${tg.slug}`} label={name} trailing={trailing}>{cells}</LedgerRow>;
}

type Update = { id: string; title: string; body: string; audience: string; created_at: string; updated_at: string | null };
const AUD_KEY: Record<string, string> = { watchers: "dashboard.audWatchers", deals: "dashboard.audDeals", all: "dashboard.audAll" };

const deleteUpdate = (id: string) =>
  fetch("/api/updates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), keepalive: true })
    .then((r) => r.ok)
    .catch(() => false);

/** The update composer: publish notifies the chosen audience (the API does the fan-out). */
function UpdateComposer() {
  const { t, tf } = useTf();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"watchers" | "deals" | "all">("all");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Update[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string; body: string } | null>(null);
  const formId = useId();
  const { pending, remove, undo } = useDeferredDelete(deleteUpdate, (id) => setHistory((h) => h.filter((u) => u.id !== id)));

  useEffect(() => {
    fetch("/api/updates").then((r) => (r.ok ? r.json() : null)).then((j) => setHistory(j?.updates ?? [])).catch(() => {});
  }, []);

  async function publish() {
    if (busy || !title.trim() || !body.trim()) return;
    setBusy(true);
    const res = await fetch("/api/updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, audience }) }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { notify.error(t("dashboard.updFailed")); return; }
    if (j.update) {
      setHistory((h) => [{ ...j.update, audience }, ...h]);
      setShowHistory(true);
    }
    setTitle(""); setBody(""); setOpen(false);
  }

  async function saveEdit() {
    if (!editing || !editing.title.trim() || !editing.body.trim()) return;
    const res = await fetch("/api/updates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, title: editing.title, body: editing.body }) }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok || !j.update) { notify.error(t("errors.generic")); return; }
    setHistory((h) => h.map((u) => (u.id === editing.id ? j.update : u)));
    setEditing(null);
  }

  return (
    <div className="sd-group">
      <Ledger columns="minmax(0,1fr) auto auto">
        <LedgerRow
          className="sd-expandable"
          trailing={
            <button type="button" className="cr-btn cr-btn--text" aria-expanded={open} aria-controls={open ? formId : undefined} onClick={() => setOpen((o) => !o)}>
              {open ? t("common.cancel") : tf("dashboard.startup.write", "Write")}
            </button>
          }
        >
          <LedgerCell primary>
            <span className="cr-row-title">{t("dashboard.postUpdate")}</span>
          </LedgerCell>
          <LedgerCell className={open ? "sd-span" : undefined}>
            {open && (
              <form id={formId} className="sd-form" onSubmit={(e) => { e.preventDefault(); void publish(); }}>
                <label htmlFor={`${formId}title`} className="sr-only">{t("dashboard.updTitle")}</label>
                <input id={`${formId}title`} className="cr-input" value={title} maxLength={150} placeholder={t("dashboard.updTitle")} onChange={(e) => setTitle(e.target.value)} />
                <label htmlFor={`${formId}body`} className="sr-only">{t("dashboard.updBody")}</label>
                <textarea id={`${formId}body`} className="cr-input" rows={4} maxLength={5000} placeholder={t("dashboard.updBody")} value={body} onChange={(e) => setBody(e.target.value)} />
                <div className="sd-form__row">
                  <label htmlFor={`${formId}audience`} className="sd-note">{t("dashboard.audienceLabel")}</label>
                  <select id={`${formId}audience`} className="cr-select" value={audience} onChange={(e) => setAudience(e.target.value as "watchers" | "deals" | "all")}>
                    {(["all", "watchers", "deals"] as const).map((a) => <option key={a} value={a}>{t(AUD_KEY[a])}</option>)}
                  </select>
                </div>
                <div className="sd-form__actions">
                  <button type="submit" className="cr-btn cr-btn--primary" disabled={busy || !title.trim() || !body.trim()} aria-busy={busy || undefined}>
                    {busy ? t("common.saving") : t("dashboard.updPost")}
                  </button>
                </div>
              </form>
            )}
          </LedgerCell>
        </LedgerRow>
        {showHistory && history.map((u) => {
          if (pending.includes(u.id)) {
            return (
              <LedgerRow key={u.id} trailing={<button type="button" className="cr-btn cr-btn--text" onClick={() => undo(u.id)}>{tf("dashboard.startup.undo", "Undo")}</button>}>
                <LedgerCell primary><span className="cr-row-sub" role="status">{tf("dashboard.startup.updateDeleted", "Update deleted.")}</span></LedgerCell>
                <LedgerCell />
              </LedgerRow>
            );
          }
          const isEditing = editing?.id === u.id;
          return (
            <LedgerRow
              key={u.id}
              className="sd-expandable"
              trailing={isEditing ? undefined : (
                <>
                  <button type="button" className="cr-btn cr-btn--text" onClick={() => setEditing({ id: u.id, title: u.title, body: u.body })}>{t("common.edit")}</button>
                  <button type="button" className="cr-btn cr-btn--text" onClick={() => remove(u.id)}>{t("common.delete")}</button>
                </>
              )}
            >
              <LedgerCell primary>
                <span className="cr-row-title">{u.title}</span>
                <span className="cr-row-sub">
                  {formatDate(u.created_at)} · {t(AUD_KEY[u.audience] ?? "dashboard.audWatchers")}{u.updated_at ? ` · ${t("dashboard.updEditedTag")}` : ""}
                </span>
                {!isEditing && <p className="sd-body">{u.body}</p>}
              </LedgerCell>
              <LedgerCell className={isEditing ? "sd-span" : undefined}>
                {isEditing && editing && (
                  <form className="sd-form" onSubmit={(e) => { e.preventDefault(); void saveEdit(); }}>
                    <label htmlFor={`${formId}${u.id}title`} className="sr-only">{t("dashboard.updTitle")}</label>
                    <input id={`${formId}${u.id}title`} className="cr-input" value={editing.title} maxLength={150} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                    <label htmlFor={`${formId}${u.id}body`} className="sr-only">{t("dashboard.updBody")}</label>
                    <textarea id={`${formId}${u.id}body`} className="cr-input" rows={3} maxLength={5000} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                    <div className="sd-form__actions">
                      <button type="button" className="cr-btn cr-btn--text" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
                      <button type="submit" className="cr-btn" disabled={!editing.title.trim() || !editing.body.trim()}>{t("common.save")}</button>
                    </div>
                  </form>
                )}
              </LedgerCell>
            </LedgerRow>
          );
        })}
      </Ledger>
      {history.length > 0 && (
        <div className="cr-ledger-foot">
          <button type="button" className="cr-btn cr-btn--text" style={{ marginInlineStart: "-0.5rem" }} aria-expanded={showHistory} onClick={() => setShowHistory((s) => !s)}>
            {t("dashboard.updHistory", { count: history.length })}
          </button>
        </div>
      )}
    </div>
  );
}

type Engagement = { events: Record<string, number>; interest: number; waitlist: number };
type Radar = { count: number; total: number; byType: Record<string, number> };

function InvestorsSection({ startup, views, saves, viewSeries, showMessages, readOnly }: {
  startup: Startup;
  views: number;
  saves: number;
  viewSeries?: number[];
  showMessages: boolean;
  readOnly: boolean;
}) {
  const { t, tf, tp, locale } = useTf();
  const [conversations, setConversations] = useState(0);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [savers, setSavers] = useState<SaversData | null>(null);
  const [viewers, setViewers] = useState<ViewersData | null>(null);
  const [offers, setOffers] = useState(0);
  const [radar, setRadar] = useState<Radar | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showAnswered, setShowAnswered] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    const read = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    void read("/api/startups/engagement").then((j) => {
      setConversations(typeof j?.conversations === "number" ? j.conversations : 0);
      setEngagement(j && typeof j.events === "object" ? { events: j.events ?? {}, interest: j.interest ?? 0, waitlist: j.waitlist ?? 0 } : null);
    });
    void read("/api/startups/savers").then((j) => setSavers(j && Array.isArray(j.savers) ? j : null));
    void read("/api/startups/viewers").then((j) => setViewers(j && Array.isArray(j.viewers) ? j : null));
    void read("/api/deals/proposals").then((j) =>
      setOffers(Array.isArray(j?.incoming) ? j.incoming.filter((p: { status?: string }) => p.status === "pending").length : 0));
    void read("/api/startups/match-radar").then((j) => setRadar(j && typeof j.count === "number" && typeof j.total === "number" ? { count: j.count, total: j.total, byType: j.byType ?? {} } : null));
    void read("/api/questions").then((j) => setQuestions(Array.isArray(j?.questions) ? j.questions : []));
    void read("/api/targets").then((j) => setTargets(Array.isArray(j?.targets) ? j.targets : []));
  }, []);

  async function patchTarget(tg: Target, patch: { note?: string | null; nextContactAt?: string | null }) {
    const res = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId: tg.investorId, ...patch }) }).catch(() => null);
    if (!res || !res.ok) { notify.error(t("errors.generic")); return false; }
    setTargets((prev) => prev.map((x) => x.id === tg.id ? { ...x, ...(patch.note !== undefined ? { note: patch.note } : {}), ...(patch.nextContactAt !== undefined ? { nextContactAt: patch.nextContactAt } : {}) } : x));
    return true;
  }

  async function setTargetStatus(tg: Target, status: string) {
    const prev = tg.status;
    setTargets((list) => list.map((x) => x.id === tg.id ? { ...x, status } : x));
    const res = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId: tg.investorId, status }) }).catch(() => null);
    if (!res || !res.ok) {
      setTargets((list) => list.map((x) => x.id === tg.id ? { ...x, status: prev } : x));
      notify.error(t("errors.generic"));
    }
  }

  // The DELETE body needs the investor id, and the row is gone from state by
  // the time the undo window closes, so the id is kept aside when the founder
  // presses Remove.
  const targetInvestor = useRef(new Map<string, string | undefined>());
  const targetDelete = useDeferredDelete(
    (id) => fetch("/api/targets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId: targetInvestor.current.get(id) }), keepalive: true })
      .then((r) => r.ok).catch(() => false),
    (id) => setTargets((prev) => prev.filter((x) => x.id !== id)),
  );

  const locked = !!(savers?.locked || viewers?.locked);
  const interested = locked ? [] : mergeInterest(savers?.savers ?? [], viewers?.viewers ?? []);
  const lockedSaved = locked ? savers?.count ?? 0 : 0;
  const lockedViewed = locked ? viewers?.count ?? 0 : 0;
  const hasLockedLine = lockedSaved > 0 || lockedViewed > 0;
  const unnamedSavers = !locked && savers ? Math.max(0, savers.count - savers.savers.length) : 0;

  const openQs = questions.filter((q) => !q.answer);
  const answeredQs = questions.filter((q) => !!q.answer);
  const showOffers = offers > 0 || (startup.status === "active" && !readOnly);
  const showRadar = !!radar && radar.total >= 20 && radar.count > 0;
  const radarTypes = showRadar && radar ? Object.entries(radar.byType).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];
  // The engagement ledger (migration 107): what people DID beyond looking,
  // plus the two signals tracked but never shown on this dashboard before.
  // Conversations already has its own clause below, so it stays out of this
  // list rather than appearing twice.
  const ev = engagement?.events ?? {};
  const engagementRows: Array<[string, number]> = ([
    [t("engagement.website"), ev.website_click ?? 0],
    [t("engagement.video"), ev.video_play ?? 0],
    [t("engagement.booking"), ev.booking_open ?? 0],
    [t("engagement.shares"), (ev.share_copy ?? 0) + (ev.share_social ?? 0)],
    [t("engagement.onepager"), ev.onepager_open ?? 0],
    [t("engagement.interest"), engagement?.interest ?? 0],
    [t("engagement.waitlist"), engagement?.waitlist ?? 0],
  ] as Array<[string, number]>).filter(([, v]) => v > 0);
  const engagementGroup = engagementRows.length > 0;
  const composer = startup.status === "active" && !readOnly;
  const waiting = showOffers || showMessages || openQs.length > 0 || answeredQs.length > 0;
  const interestGroup = interested.length > 0 || hasLockedLine || unnamedSavers > 0;
  const hasRows = waiting || interestGroup || showRadar || engagementGroup || targets.length > 0 || composer;

  // The same 30-day visits and all-time saves page.tsx counts; zeros are left out.
  const viewPoints = trendPoints(viewSeries);
  const clauses: ReactNode[] = [];
  if (views > 0) {
    const visitsClause = withFigure(tp("dashboard.startup.visits30d", "{count} visit in 30 days", "{count} visits in 30 days", views), views);
    clauses.push(
      viewPoints ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
          {visitsClause}
          <Sparkline points={viewPoints} width={40} height={12} />
        </span>
      ) : visitsClause,
    );
  }
  if (saves > 0) clauses.push(withFigure(tp("dashboard.startup.saves", "{count} save", "{count} saves", saves), saves));
  if (conversations > 0) clauses.push(withFigure(tp("dashboard.startup.conversations", "{count} conversation", "{count} conversations", conversations), conversations));
  const prose = clauses.length > 0 ? joinList(clauses, locale) : null;

  const offersLabel = offers > 0 ? t("dashboard.attnOffers") : t("dashboard.offersInbox");

  return (
    <Section id="investors" title={tf("dashboard.startup.investors", "Investors")} meta={hasRows ? prose : null}>
      {!hasRows && prose && <p className="sd-line" style={{ paddingBlock: "1rem" }}>{prose}</p>}

      {waiting && (
        <ErrorBoundary labelKey="sections.investorInterest">
          <Ledger columns="minmax(0,1fr) auto auto">
            {showOffers && (
              <LedgerRow href="/dashboard/startup/offers" label={offersLabel}>
                <LedgerCell primary><span className="cr-row-title">{offersLabel}</span></LedgerCell>
                <LedgerCell figure>{offers > 0 ? offers : null}</LedgerCell>
              </LedgerRow>
            )}
            {showMessages && (
              <LedgerRow href="/dashboard/messages" label={t("dashboard.messages")}>
                <LedgerCell primary><span className="cr-row-title">{t("dashboard.messages")}</span></LedgerCell>
                <LedgerCell />
              </LedgerRow>
            )}
            {openQs.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                readOnly={readOnly}
                onAnswered={(id, answer, priv) => setQuestions((prev) => prev.map((x) => x.id === id ? { ...x, answer, answered_at: new Date().toISOString(), is_private: priv } : x))}
              />
            ))}
            {showAnswered && answeredQs.map((q) => (
              <LedgerRow key={q.id}>
                <LedgerCell primary>
                  <span className="cr-row-title">{q.question}</span>
                  <p className="sd-body">{q.answer}{q.is_private ? ` (${t("startupDetail.privateAnswer")})` : ""}</p>
                </LedgerCell>
                <LedgerCell />
              </LedgerRow>
            ))}
          </Ledger>
          {answeredQs.length > 0 && (
            <div className="cr-ledger-foot">
              <button type="button" className="cr-btn cr-btn--text" style={{ marginInlineStart: "-0.5rem" }} aria-expanded={showAnswered} onClick={() => setShowAnswered((s) => !s)}>
                {t("dashboard.qaAnsweredCount", { count: answeredQs.length })}
              </button>
            </div>
          )}
        </ErrorBoundary>
      )}

      {interestGroup && (
        <ErrorBoundary labelKey="sections.investorInterest">
          <div className="sd-group">
            <div className="sd-group__head">
              <h3 className="sd-group__title">{tf("dashboard.startup.interestedInvestors", "Interested investors")}</h3>
            </div>
            {interested.length > 0 && (
              <Ledger columns="minmax(0,1fr) auto auto">
                {interested.map((i) => {
                  const name = i.name || i.firm || t("deals.investorFallback");
                  return (
                    <LedgerRow key={i.slug} href={`/investors/${i.slug}`} label={name}>
                      <LedgerCell primary>
                        <span className="cr-row-title">{name}</span>
                        {i.firm && i.firm !== name && <span className="cr-row-sub">{i.firm}</span>}
                      </LedgerCell>
                      <LedgerCell align="end">
                        {i.savedAt && <span className="sd-date">{t("dashboard.savedOn", { date: formatDate(i.savedAt) })}</span>}
                      </LedgerCell>
                      <LedgerCell align="end">
                        {i.viewedAt && <span className="sd-date">{t("dashboard.viewedOn", { date: formatDate(i.viewedAt) })}</span>}
                      </LedgerCell>
                    </LedgerRow>
                  );
                })}
              </Ledger>
            )}
            {/* Locked plans get the counts from the server and never the names. */}
            {hasLockedLine && (
              <p className="sd-line" style={{ paddingBlock: "0.75rem" }}>
                {lockedSaved > 0 && <>{withFigure(tp("dashboard.startup.lockedSaved", "{count} investor saved your listing.", "{count} investors saved your listing.", lockedSaved), lockedSaved)}{" "}</>}
                {lockedViewed > 0 && <>{withFigure(tp("dashboard.startup.lockedViewed", "{count} investor viewed it in the last 30 days.", "{count} investors viewed it in the last 30 days.", lockedViewed), lockedViewed)}{" "}</>}
                <Link href="/pricing" className="cr-link">{t("dashboard.upgradeSeeWho")}</Link>
              </p>
            )}
            {unnamedSavers > 0 && (
              <p className="sd-note" style={{ paddingBlock: "0.75rem" }}>
                {withFigure(tp("dashboard.startup.unnamedSavers", "{count} investor without a public profile saved your listing.", "{count} investors without a public profile saved your listing.", unnamedSavers), unnamedSavers)}
              </p>
            )}
          </div>
        </ErrorBoundary>
      )}

      {showRadar && radar && (
        <ErrorBoundary labelKey="sections.targetInvestors">
          <div className="sd-group">
            <Ledger columns="minmax(0,1fr) auto">
              <LedgerRow href="/investors" label={t("radar.title")}>
                <LedgerCell primary>
                  <span className="cr-row-title">{t("radar.title")}</span>
                  <span className="cr-row-sub">{`${radar.count} ${t("radar.ofTotal", { total: radar.total })}`}</span>
                </LedgerCell>
                <LedgerCell figure>{radar.count}</LedgerCell>
              </LedgerRow>
            </Ledger>
            {/* The shape of that demand: live investor fit broken out by type,
                the identity-free breakdown behind the headline count. */}
            {radarTypes.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", paddingBlock: "0.75rem 0" }}>
                {radarTypes.map(([type, n]) => (
                  <span key={type} className="cr-chip">{n} {INVESTOR_TYPE_KEYS[type] ? t(INVESTOR_TYPE_KEYS[type]) : sentenceCase(type)}</span>
                ))}
              </div>
            )}
          </div>
        </ErrorBoundary>
      )}

      {engagementGroup && (
        <ErrorBoundary labelKey="sections.investorInterest">
          <div className="sd-group">
            <div className="sd-group__head">
              <h3 className="sd-group__title">{t("engagement.title")}</h3>
            </div>
            <Ledger columns="minmax(0,1fr) auto">
              {engagementRows.map(([label, value]) => (
                <LedgerRow key={label}>
                  <LedgerCell primary><span className="cr-row-title">{label}</span></LedgerCell>
                  <LedgerCell figure>{value}</LedgerCell>
                </LedgerRow>
              ))}
            </Ledger>
          </div>
        </ErrorBoundary>
      )}

      {targets.length > 0 && (
        <ErrorBoundary labelKey="sections.targetInvestors">
          <div className="sd-group">
            <div className="sd-group__head">
              <h3 className="sd-group__title">{t("dashboard.yourTargets")}</h3>
            </div>
            {/* Opt-in separated variant (globals.css "Ledger: separated
               variant") -- the founder's own pipeline of investors being
               pursued, the mirror image of the investor's watchlist, so it
               gets the same "each row is an entity, not a table line"
               treatment. */}
            <Ledger columns="minmax(0,1fr) auto auto" className="cr-ledger--separated">
              {targets.map((tg) => (
                <TargetRow
                  key={tg.id}
                  tg={tg}
                  readOnly={readOnly}
                  pending={targetDelete.pending.includes(tg.id)}
                  onPatch={patchTarget}
                  onStatus={(x, s) => void setTargetStatus(x, s)}
                  onRemove={(x) => { targetInvestor.current.set(x.id, x.investorId); targetDelete.remove(x.id); }}
                  onUndo={(x) => targetDelete.undo(x.id)}
                />
              ))}
            </Ledger>
          </div>
        </ErrorBoundary>
      )}

      {composer && (
        <ErrorBoundary labelKey="sections.updateComposer">
          <UpdateComposer />
        </ErrorBoundary>
      )}
    </Section>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────

type DocViews = { docs: Array<{ id: string; opens: number; distinctViewers: number; viewers: Array<{ slug: string; name: string | null }> }>; locked: boolean };
type Roster = {
  nda: Array<{ id: string; signedAt: string | null; method: string; version: string | null; ip: string; investor: { slug: string; name: string | null } | null }>;
  signatures: Array<{ id: string; contractType: string; contractStatus: string; signerName: string; signedAt: string; ip: string; isYou: boolean; dealId: string }>;
};

const DOC_TYPES: Record<string, [string, string]> = {
  pitch_deck:      ["dashboard.startup.docPitchDeck", "Pitch deck"],
  financial_model: ["dashboard.startup.docFinancialModel", "Financial model"],
  cap_table:       ["dashboard.startup.docCapTable", "Cap table"],
  other:           ["dashboard.docOther", "Other"],
};

function DocumentsSection({ startup, readOnly }: { startup: Startup; readOnly: boolean }) {
  const { t, tf, tp } = useTf();
  const docs = startup.documents ?? [];
  const [views, setViews] = useState<DocViews | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);

  useEffect(() => {
    fetch("/api/startups/doc-views").then((r) => (r.ok ? r.json() : null)).then((j) => setViews(j && Array.isArray(j.docs) ? j : null)).catch(() => setViews(null));
    fetch("/api/nda/roster").then((r) => (r.ok ? r.json() : null)).then((j) => setRoster(j ? { nda: j.nda ?? [], signatures: j.signatures ?? [] } : null)).catch(() => setRoster(null));
  }, []);

  const byId = new Map((views?.docs ?? []).map((d) => [d.id, d]));
  const signed = (roster?.nda.length ?? 0) + (roster?.signatures.length ?? 0);
  const showNda = !readOnly && (signed > 0 || docs.some((d) => d.requires_nda));
  const ndaLabel = tf("dashboard.startup.ndaRecord", "NDA record");

  // DisclosureLog on /dashboard/startup/nda has no export, so the roster CSV stays here.
  function exportCsv() {
    if (!roster) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows: string[][] = [[
      tf("dashboard.startup.csvKind", "Type"),
      t("dashboard.rosterParty"),
      t("dashboard.rosterType"),
      t("dashboard.statusLabel"),
      t("dashboard.rosterWhen"),
      t("dashboard.rosterMethod"),
      tf("dashboard.startup.csvVersion", "Version"),
      "IP",
    ]];
    roster.nda.forEach((r) => rows.push(["NDA", r.investor?.name ?? "", "NDA", tf("dashboard.startup.csvSigned", "Signed"), r.signedAt ?? "", r.method, r.version ?? "", r.ip]));
    roster.signatures.forEach((s) => rows.push([tf("dashboard.startup.csvContract", "Contract"), s.signerName + (s.isYou ? ` (${t("common.you")})` : ""), sentenceCase(s.contractType), sentenceCase(s.contractStatus), s.signedAt, tf("dashboard.startup.eSignature", "E-signature"), "", s.ip]));
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "capitalreach-signature-roster.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Section
      id="documents"
      title={t("dashboard.documents")}
      end={docs.length > 0 && !readOnly ? <Link href="/dashboard/startup/documents" className="cr-btn cr-btn--text">{t("dashboard.manage")}</Link> : null}
    >
      {docs.length > 0 ? (
        <ErrorBoundary labelKey="sections.documentAnalytics">
          <Ledger columns="minmax(0,1fr) auto auto">
            {docs.map((doc) => {
              const v = byId.get(doc.id);
              const [typeKey, typeFallback] = DOC_TYPES[doc.type] ?? ["", sentenceCase(doc.type)];
              const typeLabel = typeKey ? tf(typeKey, typeFallback) : typeFallback;
              const names = !views?.locked && v ? v.viewers.map((x) => x.name).filter(Boolean).join(", ") : "";
              return (
                <LedgerRow
                  key={doc.id}
                  trailing={
                    // A plain anchor: a prefetching link would open the file and count a view.
                    <a href={`/api/documents/open?id=${doc.id}`} target="_blank" rel="noopener noreferrer" className="cr-btn cr-btn--text">{t("dashboard.view")}</a>
                  }
                >
                  <LedgerCell primary>
                    <span className="cr-row-title">{doc.label}</span>
                    {doc.requires_nda && <>{" "}<span className="cr-chip">{t("dashboard.ndaRequired")}</span></>}
                    <span className="cr-row-sub">
                      {typeLabel}{names ? ` · ${tf("dashboard.startup.openedBy", "Opened by {names}", { names })}` : ""}
                    </span>
                  </LedgerCell>
                  <LedgerCell align="end">
                    {v && v.opens > 0 && (
                      <span className="sd-date">
                        {withFigure(tp("dashboard.startup.opens", "{count} open", "{count} opens", v.opens), v.opens)}
                        {v.distinctViewers > 0 && <> · {withFigure(tp("dashboard.startup.investorCount", "{count} investor", "{count} investors", v.distinctViewers), v.distinctViewers)}</>}
                      </span>
                    )}
                  </LedgerCell>
                </LedgerRow>
              );
            })}
          </Ledger>
        </ErrorBoundary>
      ) : (
        <EmptyState
          title={t("dashboard.noDocuments")}
          action={readOnly ? undefined : (
            <Link href="/dashboard/startup/documents" className="cr-link sd-do">
              {tf("dashboard.uploadFirstDoc", "Upload your first document")}
            </Link>
          )}
        />
      )}
      {showNda && (
        <Ledger columns="minmax(0,1fr) auto">
          <LedgerRow
            href="/dashboard/startup/nda"
            label={ndaLabel}
            trailing={signed > 0 ? <button type="button" className="cr-btn cr-btn--text" onClick={exportCsv}>{t("dashboard.exportCsv")}</button> : undefined}
          >
            <LedgerCell primary>
              <span className="cr-row-title">{ndaLabel}</span>
              {signed > 0 && <span className="cr-row-sub">{tp("dashboard.startup.signaturesOnRecord", "{count} signature on record", "{count} signatures on record", signed)}</span>}
            </LedgerCell>
          </LedgerRow>
        </Ledger>
      )}
      {/* The stage row's "Share your round" lands here, so the anchor exists
          whether or not any link has been created yet. */}
      <div id="share" className="sd-anchor">
        {!readOnly && <ShareLinks />}
      </div>
    </Section>
  );
}

// ── Pitch feedback ────────────────────────────────────────────────────────────

type PitchFeedback = {
  overall_score?: number;
  clarity?: string;
  market_sizing?: string;
  competitive_positioning?: string;
  missing_information?: string;
};

function PitchFeedbackSection({ startup, canWrite, readOnly }: { startup: Startup; canWrite: boolean; readOnly: boolean }) {
  const { t, tf } = useTf();
  const [feedback, setFeedback] = useState<PitchFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const score = typeof startup.vaultrise_score === "number" ? startup.vaultrise_score : null;

  async function generate() {
    if (readOnly || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/pitch-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId: startup.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify.error(data.error || t("errors.generic")); return; }
      setFeedback(data);
    } catch {
      notify.error(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  if (!canWrite && score === null && !feedback) return null;

  const offerGenerate = canWrite && !readOnly && !feedback;
  const scoreRow = !feedback && !offerGenerate && score !== null;
  const meta = score !== null && !scoreRow ? (
    <>
      {withFigure(tf("dashboard.startup.consistencyScore", "Consistency score {score} of 100", { score }), score)}{" "}
      <InfoTip termKey="glossary.aiScore" />
    </>
  ) : null;

  const blocks: Array<[keyof PitchFeedback, string]> = [
    ["clarity", t("dashboard.fbClarity")],
    ["market_sizing", t("dashboard.fbMarket")],
    ["competitive_positioning", t("dashboard.fbCompetitive")],
    ["missing_information", t("dashboard.fbMissing")],
  ];

  return (
    <Section
      id="pitch-feedback"
      title={tf("dashboard.startup.pitchFeedback", "Pitch feedback")}
      meta={meta}
      end={feedback && canWrite && !readOnly ? (
        <button type="button" className="cr-btn cr-btn--text" onClick={generate} disabled={loading} aria-busy={loading || undefined}>
          {loading ? t("dashboard.analyzing") : t("dashboard.regenerate")}
        </button>
      ) : null}
    >
      {feedback ? (
        <Ledger columns="minmax(0,1fr) auto">
          {typeof feedback.overall_score === "number" && (
            <LedgerRow>
              <LedgerCell primary><span className="cr-row-title">{tf("dashboard.startup.overallScore", "Overall score")}</span></LedgerCell>
              <LedgerCell figure>{`${feedback.overall_score}/100`}</LedgerCell>
            </LedgerRow>
          )}
          {blocks.filter(([key]) => typeof feedback[key] === "string" && String(feedback[key]).trim()).map(([key, label]) => (
            <LedgerRow key={key}>
              <LedgerCell primary>
                <span className="cr-row-title">{label}</span>
                <p className="sd-body">{String(feedback[key])}</p>
              </LedgerCell>
              <LedgerCell />
            </LedgerRow>
          ))}
        </Ledger>
      ) : offerGenerate ? (
        <Ledger columns="minmax(0,1fr) auto">
          <LedgerRow
            trailing={
              <button type="button" className="cr-btn" onClick={generate} disabled={loading} aria-busy={loading || undefined}>
                {loading ? t("dashboard.analyzing") : t("dashboard.generateFeedback")}
              </button>
            }
          >
            <LedgerCell primary><span className="cr-row-title">{t("dashboard.aiPitchFeedbackSub")}</span></LedgerCell>
          </LedgerRow>
        </Ledger>
      ) : scoreRow ? (
        <Ledger columns="minmax(0,1fr) auto">
          <LedgerRow>
            <LedgerCell primary><span className="cr-row-title">{t("dashboard.aiScore")}</span></LedgerCell>
            <LedgerCell figure>{score}</LedgerCell>
          </LedgerRow>
        </Ledger>
      ) : null}
    </Section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function StartupDashboardClient({ profile, startup, analytics, isLaunchMode, viewingAs, rejectionReason = null, needsClosureDeclaration = false, benchmarks = null }: Props) {
  const { t, tf } = useTf();
  const messagingAvailable = useMessagingAvailable();
  const readOnly = !!viewingAs;
  // The signature is a listing-level record, not a wizard step: a founder
  // signs once, and again only when the wording changes. Initialised from the
  // row so a founder who signed is not asked again.
  const [attestOpen, setAttestOpen] = useState(false);
  const [attestedAt, setAttestedAt] = useState<string | null>(startup?.founder_attestation_at ?? null);

  // Arrival notices from onboarding and checkout, read once from the URL:
  // outcomes the founder cannot otherwise see.
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

  // ── No startup yet: content height, left-aligned, in the normal container.
  if (!startup) {
    return (
      <main className="sd-page">
        <style>{STYLES}</style>
        <div style={CONTAINER}>
          <PageHeader title={t("dashboard.setUpProfile")} />
          <p className="sd-line">{t("dashboard.setUpProfileSub")}</p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.5rem", marginBlockStart: "1.5rem" }}>
            {!readOnly && <Link href="/onboarding/startup" className="cr-btn cr-btn--primary">{t("dashboard.createYourProfile")}</Link>}
            <RoleSwitchLink to="investor" />
          </div>
        </div>
      </main>
    );
  }

  const { percent, items } = listingCompleteness(startup);
  // The deck has its own step; the hint names the heaviest other gap.
  const nextItem = items.find((i) => !i.done && i.key !== "deck");
  const nextHint = nextItem ? `${t(nextItem.labelKey)} · ${t("completeness.worth", { points: nextItem.weight })}` : null;
  const tier = startup.subscription_tier || "free";
  // Mirrors founderCan(): suspension outranks the tier, then Growth, or any
  // member during launch. The API enforces the same rule; this only keeps the
  // page from offering what it would refuse.
  const suspendedAccount = profile?.suspended === true || profile?.account_status === "suspended";
  const canWrittenFeedback = !suspendedAccount && (isLaunchMode || tier === "growth");
  const statusLabel = STATUS_KEYS[startup.status] ? t(STATUS_KEYS[startup.status]) : sentenceCase(String(startup.status));

  return (
    <ReadOnlyProvider value={readOnly}>
      <main className="sd-page">
        <style>{STYLES}</style>

        {/* At the very top: an admin reading someone else's numbers must never
            mistake them for their own, and must be able to leave in one click. */}
        {viewingAs && (
          <div role="status" className="sd-banner">
            <span>{t("viewAs.banner", { name: viewingAs })}</span>
            <span>{t("viewAs.readOnly")}</span>
            <Link href="/admin">{t("viewAs.exit")}</Link>
          </div>
        )}

        <div style={CONTAINER}>
          <PageHeader
            title={startup.name}
            meta={<span className="cr-chip">{statusLabel}</span>}
            end={
              <>
                {!readOnly && <Link href="/dashboard/startup/edit" className="cr-btn">{tf("dashboard.startup.editListing", "Edit listing")}</Link>}
                {/* What a real investor meets: tier zeroed, documents locked. */}
                <Link href={`/startups/${startup.slug}?preview=investor`} target="_blank" rel="noopener" className="cr-btn cr-btn--text">{t("preview.open")}</Link>
              </>
            }
          />

          <StageRow
            startup={startup}
            rejectionReason={rejectionReason}
            needsClosureDeclaration={needsClosureDeclaration}
            readOnly={readOnly}
          />

          <div className="sd-sections">
            <ErrorBoundary labelKey="sections.fundraiseChecklist">
              <FundraiseChecklist
                startup={startup}
                completeness={percent}
                nextHint={nextHint}
                attestation={attestedAt ? null : { onSign: readOnly ? undefined : () => setAttestOpen(true) }}
                tractionHref="#round"
              />
            </ErrorBoundary>

            <RoundSection
              startup={startup}
              raise={analytics.raise ?? { softCircled: 0, committed: 0 }}
              deals={analytics.deals}
              saves={analytics.saves}
              funnel={analytics.funnel ?? null}
              benchmarks={benchmarks}
              readOnly={readOnly}
            />

            <InvestorsSection
              startup={startup}
              views={analytics.views}
              saves={analytics.saves}
              viewSeries={analytics.viewSeries}
              showMessages={messagingAvailable === true}
              readOnly={readOnly}
            />

            <DocumentsSection startup={startup} readOnly={readOnly} />

            <PitchFeedbackSection startup={startup} canWrite={canWrittenFeedback} readOnly={readOnly} />
          </div>

          {/* A founder's best introduction is often the investor who passed
              politely. An invite is theirs to send, so view-as hides it. */}
          {!readOnly && (
            <div className="sd-foot">
              <InvitePanel defaultRole="investor" />
            </div>
          )}
        </div>

        {!readOnly && (
          <FounderAttestationModal
            open={attestOpen}
            startupId={startup.id}
            onCancel={() => setAttestOpen(false)}
            onAttested={({ attestedAt: at }) => { setAttestedAt(at); setAttestOpen(false); }}
          />
        )}
      </main>
    </ReadOnlyProvider>
  );
}
