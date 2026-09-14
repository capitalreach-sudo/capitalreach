"use client";

/* Hallmark · genre: modern-minimal · surface: investor dashboard
 * One column of sections in job order: waiting on you, what moved, who
 * viewed you, recently viewed, the watchlist, positions, reports. A section
 * renders only with rows.
 * states: default · hover · focus · active · disabled · loading · error
 */

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { notify } from "@/components/ui/toast-notify";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { buildAccessContext, investorCan } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/currency";
import { allocationSummary } from "@/lib/round-math";
import { safeFormatCurrencyAmount } from "@/lib/validators";
import { STAGE_LABELS } from "@/lib/utils";
import { displayLocale } from "@/lib/display-locale";
import { createClient } from "@/lib/supabase";
import type { Profile, Investor, Watchlist, Deal, AiReport } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { useProfile } from "@/hooks/useProfile";
import { useMessagingAvailable } from "@/hooks/useMessagingAvailable";
import { InvitePanel } from "@/components/shared/invite-panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WatchlistChanges } from "@/components/investor/watchlist-changes";
import { ReadOnlyProvider, useReadOnly } from "@/components/dashboard/read-only";
import { PageHeader } from "@/components/ui/page-header";
import { Ledger, LedgerCell, LedgerHead, LedgerRow, Section } from "@/components/ui/ledger";
import { FilterMenu } from "@/components/ui/filter-bar";

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

// Dashboard-only layout rules. Everything shared (rows, sections, buttons,
// fields) comes from the LEDGER SYSTEM block in app/globals.css; these only
// place cells the shared grid does not know about. Tokens only.
const DASH_CSS = `
.crd-page{max-width:1100px;margin-inline:auto;padding-inline:clamp(1rem,4vw,2rem);padding-block-end:4rem}
.crd-viewas{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;column-gap:1rem;padding-block:0.25rem;padding-inline:1.5rem;background-color:var(--cr-ink);color:var(--cr-paper);font-family:var(--font-dm-sans),system-ui,sans-serif;font-size:0.8125rem;line-height:1.4}
.crd-viewas a{display:inline-flex;align-items:center;min-height:2.75rem;color:inherit;font-weight:600;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.crd-viewas a:focus-visible{outline:2px solid var(--cr-copper) !important;outline-offset:2px;box-shadow:none !important}
.crd-passed .cr-row-title{color:var(--cr-ink-3)}
.crd-note{margin:0.25rem 0 0;max-width:60ch;font-family:var(--font-dm-sans),system-ui,sans-serif;font-size:0.8125rem;font-weight:400;line-height:1.4;color:var(--cr-ink-2);white-space:pre-wrap;overflow-wrap:anywhere}
.crd-note-field{display:block;margin-block-start:0.5rem;max-width:60ch}
.crd-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:0.5rem}
.crd-priority{display:inline-flex;align-items:center;gap:0.25rem}
.crd-priority-dot{inline-size:0.75rem;block-size:0.75rem;padding:0;border-radius:50%;border:1px solid var(--cr-rule-dark);background:transparent;cursor:pointer}
.crd-priority-dot[data-on]{border-color:var(--cr-copper);background-color:var(--cr-copper)}
.crd-priority-dot:disabled{cursor:default}
.crd-toggle-cell{align-self:center;justify-self:end}
.crd-expand{grid-column:1 / -1;grid-row-start:2}
.crd-report{margin:0.5rem 0 0;max-width:72ch;font-family:var(--font-dm-sans),system-ui,sans-serif;font-size:0.9375rem;font-weight:400;line-height:1.55;color:var(--cr-ink-2);white-space:pre-wrap;overflow-wrap:anywhere}
.crd-actions{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin-block-start:0.75rem}
.crd-flush{margin-inline-start:-0.5rem}
.crd-meta{display:inline-flex;flex-wrap:wrap;align-items:baseline;column-gap:0.75rem;row-gap:0.25rem}
.crd-figure-lg{font-family:var(--font-serif);font-size:1.75rem;font-weight:600;font-style:normal;line-height:1.2;letter-spacing:-0.02em;color:var(--cr-ink);font-variant-numeric:tabular-nums;font-optical-sizing:auto}
.crd-end-text{font-family:var(--font-dm-sans),system-ui,sans-serif;font-size:0.8125rem;line-height:1.4;color:var(--cr-ink-2);font-variant-numeric:tabular-nums;white-space:nowrap}
.crd-mlabel{margin-inline-end:0.5rem;font-family:var(--font-dm-sans),system-ui,sans-serif;font-size:0.8125rem;font-weight:400;color:var(--cr-ink-3)}
.crd-up{color:var(--cr-up)}
.crd-down{color:var(--cr-down)}
.crd-alloc{display:flex;flex-wrap:wrap;align-items:flex-end;gap:0.5rem 0.75rem;padding-block:1rem}
.crd-alloc label{display:flex;flex-direction:column;gap:0.25rem;font-family:var(--font-dm-sans),system-ui,sans-serif;font-size:0.8125rem;font-weight:400;line-height:1.4;color:var(--cr-ink-3)}
.crd-alloc .cr-input{width:10rem}
.crd-field-error{flex-basis:100%;margin:0;font-family:var(--font-dm-sans),system-ui,sans-serif;font-size:0.8125rem;line-height:1.4;color:var(--cr-down)}
.crd-undo{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem 1rem}
.crd-undo:not(:empty){padding-block-start:0.75rem}
.crd-undo-text{font-family:var(--font-dm-sans),system-ui,sans-serif;font-size:0.8125rem;line-height:1.4;color:var(--cr-ink-2)}
.crd-skel{display:flex;flex-direction:column}
.crd-skel-line{display:flex;align-items:center;height:1.3125rem}
.crd-skel-line--sub{height:1.1375rem}
.crd-foot{margin-block-start:3rem}
/* Flush on the row, so whichever text button comes first lines up with the text column. */
.crd-foot-links{display:flex;flex-wrap:wrap;align-items:center;gap:0 0.5rem;margin-inline-start:-0.5rem}
.crd-foot-panel{margin-block-start:1rem}
@media (min-width:768px){
  .crd-mlabel{display:none}
  .crd-waiting .cr-row:not(:has(> .cr-cell--trailing)){grid-template-columns:minmax(0,1fr) auto}
}
@media (max-width:767px){
  .crd-controls{justify-content:flex-start}
  .cr-row > .cr-cell.crd-toggle-cell{grid-column:3;grid-row:1;margin-inline-start:0.5rem}
}
`;

// The shared formatters answer an em dash for implausible values; a ledger
// says "Not stated" in words instead (S13).
const FORMATTER_DASH = "\u2014";
const UNDO_MS = 6000;

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/**
 * t() plus English fallbacks for keys the dictionaries do not carry yet.
 * t() echoes an unknown key back, so an echo means "use the fallback".
 */
function useStrings() {
  const { t } = useTranslation();
  const tf = useCallback(
    (key: string, fallback: string, vars?: Vars) => {
      const out = t(key, vars);
      return out === key ? fill(fallback, vars) : out;
    },
    [t],
  );
  const tfn = useCallback(
    (key: string, count: number, one: string, other: string) => tf(key, count === 1 ? one : other, { count }),
    [tf],
  );
  return { t, tf, tfn };
}

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "";
  return STAGE_LABELS[stage] ?? STAGE_LABELS[stage.replace("_", "-")] ?? stage.replace(/_/g, " ");
}

function compactMoney(amount: number | null | undefined, currency?: string | null): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const out = formatMoney(amount, currency ?? undefined, { compact: true });
  return out === FORMATTER_DASH ? null : out;
}

function NotStated() {
  const { tf } = useStrings();
  return <span className="cr-absent">{tf("common.ledger.notStated", "Not stated")}</span>;
}

function RowSkeleton() {
  return (
    <div className="crd-skel" aria-hidden="true">
      <div className="crd-skel-line"><Skeleton w="min(14rem, 60%)" h="0.9375rem" /></div>
      <div className="crd-skel-line crd-skel-line--sub"><Skeleton w="min(9rem, 40%)" h="0.8125rem" /></div>
    </div>
  );
}

// ── Reversible deletes ──────────────────────────────────────────────────────

/**
 * Optimistic delete with Undo (S9). The row disappears at once; the server
 * delete is sent only when the undo window closes, another delete starts, the
 * page is hidden, or the component unmounts. commit resolves false on failure,
 * which brings the row back.
 */
function useUndoableDelete(commit: (id: string) => Promise<boolean>) {
  const [pending, setPending] = useState<string | null>(null);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });

  const clearTimer = () => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const flush = useCallback(() => {
    clearTimer();
    const id = pendingRef.current;
    if (!id) return;
    pendingRef.current = null;
    setPending(null);
    setGone((prev) => new Set(prev).add(id));
    void commitRef.current(id).then((ok) => {
      if (!ok) setGone((prev) => { const next = new Set(prev); next.delete(id); return next; });
    });
  }, []);

  const remove = useCallback((id: string) => {
    flush();
    pendingRef.current = id;
    setPending(id);
    timerRef.current = window.setTimeout(flush, UNDO_MS);
  }, [flush]);

  const undo = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    setPending(null);
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [flush]);

  const isHidden = (id: string) => id === pending || gone.has(id);
  return { pending, remove, undo, isHidden };
}

/** The live region under a ledger that offers Undo while a delete is pending. */
function UndoFoot({ pendingId, message, onUndo }: { pendingId: string | null; message: string; onUndo: () => void }) {
  const { tf } = useStrings();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Each delete takes its focused Delete button with it, so every new
  // pending row moves focus here, even when the message text is unchanged.
  useEffect(() => { if (pendingId) buttonRef.current?.focus(); }, [pendingId]);
  return (
    <div className="crd-undo" role="status">
      {pendingId && (
        <>
          <span className="crd-undo-text">{message}</span>
          <button ref={buttonRef} type="button" className="cr-btn cr-btn--text" onClick={onUndo}>
            {tf("common.ledger.undo", "Undo")}
          </button>
        </>
      )}
    </div>
  );
}

// ── Waiting on you ──────────────────────────────────────────────────────────

type IncomingOffer = {
  id: string; status?: string; fromSide?: string;
  amount?: number | null; currency?: string | null; createdAt?: string | null;
  counterpart?: { name?: string | null } | null;
};

type Share = {
  id: string; note: string | null; created_at: string; thread_id: string | null;
  startup: { name: string; slug: string } | null;
  from_investor?: { slug: string; display_name: string | null; firm_name: string | null } | null;
};

type WaitRow = {
  key: string; href?: string; title: string; sub: string; note?: string | null;
  figure: string | null; action: string; extra?: ReactNode;
};

/**
 * What waits on this investor's decision: offers sent to them, deals at due
 * diligence or term sheet, listings other investors shared, and missing
 * thesis fields as one row. The one primary action of the page sits on the
 * first row.
 *
 * In view-as the proposals and share APIs would answer with the ADMIN's own
 * inbox under the member's name, and every row link would open the admin's
 * surfaces, so only the thesis row renders there, without a link.
 */
function WaitingOnYou({ deals, investor, live }: { deals: Deal[]; investor: Investor; live: boolean }) {
  const { t, tf } = useStrings();
  // A share's thread is between two investors, which no member may use; only
  // an admin is offered the way into it.
  const { profile } = useProfile();
  const shareThreadsOpen = profile?.role === "admin";
  const [offers, setOffers] = useState<IncomingOffer[] | null>(live ? null : []);
  const [shares, setShares] = useState<Share[] | null>(live ? null : []);

  useEffect(() => {
    if (!live) return;
    let alive = true;
    fetch("/api/deals/proposals")
      .then((r) => (r.ok ? r.json() : null))
      // Incoming chains carry their closed ancestors; only pending rounds a
      // founder sent to this investor are waiting on a reply.
      .then((j: { incoming?: IncomingOffer[] } | null) => {
        if (alive) setOffers((j?.incoming ?? []).filter((p) => p.status === "pending" && p.fromSide === "startup"));
      })
      .catch(() => { if (alive) setOffers([]); });
    fetch("/api/deals/share")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { received?: Share[] } | null) => { if (alive) setShares(j?.received ?? []); })
      .catch(() => { if (alive) setShares([]); });
    return () => { alive = false; };
  }, [live]);

  const gaps: string[] = [];
  if (!investor.investment_thesis) gaps.push(t("dashboard.thesisGapThesis"));
  if (!investor.stages?.length) gaps.push(t("dashboard.thesisGapStages"));
  if (!investor.industries?.length) gaps.push(t("dashboard.thesisGapIndustries"));
  if (!investor.geography?.length) gaps.push(t("dashboard.thesisGapGeo"));
  if (!investor.min_check && !investor.max_check) gaps.push(t("dashboard.thesisGapCheck"));

  const rows: WaitRow[] = [];
  if (live) {
    for (const o of offers ?? []) {
      rows.push({
        key: `offer-${o.id}`,
        href: "/deals",
        title: o.counterpart?.name || t("dashboard.startupLabel"),
        sub: [tf("dashboard.investor.waitOffer", "Offer awaiting your reply"), o.createdAt ? formatDate(o.createdAt) : null].filter(Boolean).join(" · "),
        figure: compactMoney(o.amount, o.currency),
        action: tf("dashboard.investor.reply", "Reply"),
      });
    }
    const negotiating = deals
      .filter((d) => d.status === "term_sheet" || d.status === "due_diligence")
      .sort((a, b) => Number(a.status !== "term_sheet") - Number(b.status !== "term_sheet"));
    for (const d of negotiating) {
      rows.push({
        key: `deal-${d.id}`,
        href: `/deals?deal=${d.id}`,
        title: d.startup?.name || t("dashboard.startupLabel"),
        sub: d.status === "term_sheet"
          ? tf("dashboard.investor.waitTermSheet", "Term sheet on the table")
          : tf("dashboard.investor.waitDiligence", "In due diligence"),
        figure: compactMoney(d.amount, d.currency),
        action: tf("dashboard.investor.review", "Review"),
      });
    }
    for (const s of shares ?? []) {
      const from = s.from_investor?.display_name || s.from_investor?.firm_name || t("deals.investorFallback");
      rows.push({
        key: `share-${s.id}`,
        href: s.startup?.slug ? `/startups/${s.startup.slug}` : undefined,
        title: s.startup?.name || t("dashboard.startupLabel"),
        sub: `${tf("dashboard.investor.sharedBy", "Shared by {name}", { name: from })} · ${formatDate(s.created_at)}`,
        note: s.note,
        figure: null,
        action: t("common.open"),
        extra: s.thread_id && shareThreadsOpen
          ? <Link href={`/dashboard/messages?thread=${s.thread_id}`} className="cr-btn cr-btn--text">{t("coInvestors.continueThread")}</Link>
          : undefined,
      });
    }
  }
  if (gaps.length > 0) {
    rows.push({
      key: "thesis",
      href: live ? "/dashboard/investor/settings" : undefined,
      title: tf("dashboard.investor.thesisRow", "Finish your investment profile"),
      sub: `${t("dashboard.thesisMissing")}: ${gaps.join(", ")}`,
      figure: null,
      action: t("dashboard.completeProfile"),
    });
  }

  const title = tf("dashboard.investor.waitingTitle", "Waiting on you");
  const loaded = offers !== null && shares !== null;

  if (!loaded) {
    return (
      <Section id="waiting" title={title}>
        {/* Separated variant (globals.css "Ledger: separated variant") on the
           skeleton too, so the loading state doesn't flash as a flat hairline
           list a moment before the loaded rows resolve into cards. */}
        <Ledger busy columns="minmax(0,1fr)" className="cr-ledger--separated">
          {Array.from({ length: Math.max(1, rows.length) }, (_, i) => (
            <LedgerRow key={i}>
              <LedgerCell primary><RowSkeleton /></LedgerCell>
            </LedgerRow>
          ))}
        </Ledger>
      </Section>
    );
  }

  if (rows.length === 0) {
    if (!live) return null;
    return (
      <Section id="waiting" title={title}>
        <EmptyState title={tf("dashboard.investor.waitingNone", "Nothing is waiting on you.")} />
      </Section>
    );
  }

  return (
    <Section id="waiting" title={title}>
      {/* Opt-in separated variant (globals.css "Ledger: separated variant")
         -- each row here is a distinct deal, offer or share in motion, not
         a line in a dense table, so it gets the same treatment as the
         investor directory and the watchlist below. */}
      <Ledger columns="minmax(0,1fr) auto auto" className="crd-waiting cr-ledger--separated">
        {rows.map((r, i) => {
          const primaryAction = i === 0 && r.href
            ? <Link href={r.href} className="cr-btn cr-btn--primary">{r.action}</Link>
            : null;
          const trailing = primaryAction || r.extra ? <>{primaryAction}{r.extra}</> : undefined;
          const cells = [
            <LedgerCell key="name" primary>
              <span className="cr-row-title">{r.title}</span>
              <span className="cr-row-sub">{r.sub}</span>
              {r.note && <span className="cr-row-sub">{`“${r.note}”`}</span>}
            </LedgerCell>,
            <LedgerCell key="figure" figure>{r.figure}</LedgerCell>,
          ];
          return r.href ? (
            <LedgerRow key={r.key} href={r.href} label={r.title} trailing={trailing}>{cells}</LedgerRow>
          ) : (
            <LedgerRow key={r.key} trailing={trailing}>{cells}</LedgerRow>
          );
        })}
      </Ledger>
    </Section>
  );
}

// ── Saved searches ──────────────────────────────────────────

/**
 * Saved searches live on /startups: the Saved menu there lists them, applies
 * one in place, and deletes one with an Undo, and "Save search" creates them.
 * The daily cron matches every saved search either way, so there is no
 * per-search switch to carry across.
 *
 * This is the way back to that menu. `enabled` carries the same investorCan
 * savedSearches capability that /startups resolves server-side, so the link
 * never leads to a menu that will not render there. Mounted only outside
 * view-as: the API answers with the caller's own searches, and in view-as the
 * caller is the admin.
 */
function SavedSearchesLink({ enabled }: { enabled: boolean }) {
  const { t } = useStrings();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch("/api/saved-searches")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setCount(Array.isArray(j?.searches) ? j.searches.length : 0); })
      .catch(() => { if (alive) setCount(0); });
    return () => { alive = false; };
  }, [enabled]);

  // The Saved menu only exists once a search does, so until then this would
  // point at nothing.
  if (!enabled || count === 0) return null;

  return (
    <Link href="/startups" className="cr-btn cr-btn--text">
      {t("startups.savedSearches")}
    </Link>
  );
}

// ── Who viewed you ──────────────────────────────────────────────────────────

type EngagementViewer = { name: string; kind: "investor" | "founder"; slug: string | null; lastAt: string };
type EngagementData = {
  views: number; viewers: EngagementViewer[];
  interest: number; conversations: number; locked: boolean;
};

/**
 * Migration 107's engagement layer -- the investor-side mirror of the
 * founder's own "Investors" section (startup-dashboard-client.tsx): counts
 * for every plan, names for paid tiers (and everyone during launch), a
 * private viewer counted but never named. The API (/api/investors/engagement)
 * was built and shipped in the 09-05 "wow features" round and stayed live
 * through the redesign; only the panel reading it was dropped. Mounted only
 * outside view-as -- the endpoint answers as the CALLER, and in view-as the
 * caller is the admin, not the investor being viewed.
 */
function ProfileViewersSection() {
  const { t, tf, tfn } = useStrings();
  const [data, setData] = useState<EngagementData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/investors/engagement")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: EngagementData | null) => { if (alive) setData(j); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, []);

  if (!data || (data.views === 0 && data.interest === 0 && data.conversations === 0)) return null;

  // The dictionary's "engagement.*" strings are bare labels meant to sit
  // beside a separately rendered figure (the pre-redesign shape); this meta
  // line is one sentence, so it uses its own {count}-carrying fallbacks
  // rather than an interpolation the old keys were never written for.
  const clauses: string[] = [];
  if (data.views > 0) clauses.push(tfn("dashboard.investor.viewsCount", data.views, "{count} view in 30 days", "{count} views in 30 days"));
  if (data.interest > 0) clauses.push(tfn("dashboard.investor.interestCount", data.interest, "{count} interested", "{count} interested"));
  if (data.conversations > 0) clauses.push(tfn("dashboard.investor.conversationsCount", data.conversations, "{count} conversation", "{count} conversations"));

  return (
    <Section id="viewers" title={t("engagement.whoViewedYou")} meta={clauses.join(" · ")}>
      {data.locked && data.views > 0 ? (
        <p className="crd-note" style={{ paddingBlock: "0.75rem" }}>
          {tf("dashboard.investor.viewersLocked", "Names are a paid feature.")}{" "}
          <Link href="/pricing" className="cr-link">{t("dashboard.upgradeSeeWho")}</Link>
        </p>
      ) : data.viewers.length > 0 ? (
        <Ledger columns="minmax(0,1fr) auto">
          {data.viewers.slice(0, 8).map((v, i) => {
            const href = v.slug ? (v.kind === "investor" ? `/investors/${v.slug}` : `/startups/${v.slug}`) : undefined;
            const row = (
              <>
                <LedgerCell primary>
                  <span className="cr-row-title">{v.name}</span>
                </LedgerCell>
                <LedgerCell align="end">
                  <time className="cr-row-sub" dateTime={v.lastAt} style={{ fontVariantNumeric: "tabular-nums" }}>{formatDate(v.lastAt)}</time>
                </LedgerCell>
              </>
            );
            return href
              ? <LedgerRow key={`${v.slug}-${i}`} href={href} label={v.name}>{row}</LedgerRow>
              : <LedgerRow key={`${v.slug}-${i}`}>{row}</LedgerRow>;
          })}
        </Ledger>
      ) : null}
    </Section>
  );
}

// ── Recently viewed ──────────────────────────────────────────────────────────

type RecentView = { slug: string; name: string; viewedAt: string };

/**
 * The last listings this investor opened, from their own startup_views
 * history (RLS scopes the read to the caller's own rows). Deal-flow triage
 * starts where it left off instead of from a cold directory. Mounted only
 * outside view-as: in view-as this would read the ADMIN's own trail, not the
 * member's.
 */
function JumpBackInSection() {
  const { t } = useStrings();
  const supabase = useRef(createClient()).current;
  const [rows, setRows] = useState<RecentView[] | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("startup_views")
      .select("viewed_at, startup:startups(slug, name, status)")
      .order("viewed_at", { ascending: false })
      .limit(30)
      .then(({ data }: { data: any[] | null }) => {
        if (!alive) return;
        const seen = new Map<string, RecentView>();
        for (const r of (data ?? []) as any[]) {
          const s = r.startup;
          if (!s?.slug || s.status !== "active" || seen.has(s.slug)) continue;
          seen.set(s.slug, { slug: s.slug, name: s.name, viewedAt: r.viewed_at });
        }
        setRows(Array.from(seen.values()).slice(0, 6));
      });
    return () => { alive = false; };
  }, [supabase]);

  if (!rows || rows.length === 0) return null;

  return (
    <Section id="recently-viewed" title={t("dashboard.jumpBackIn")}>
      <Ledger columns="minmax(0,1fr) auto">
        {rows.map((r) => (
          <LedgerRow key={r.slug} href={`/startups/${r.slug}`} label={r.name}>
            <LedgerCell primary><span className="cr-row-title">{r.name}</span></LedgerCell>
            <LedgerCell align="end">
              <time className="cr-row-sub" dateTime={r.viewedAt} style={{ fontVariantNumeric: "tabular-nums" }}>{formatDate(r.viewedAt)}</time>
            </LedgerCell>
          </LedgerRow>
        ))}
      </Ledger>
    </Section>
  );
}

// ── Watchlist ───────────────────────────────────────────────────────────────

/**
 * C26: the watchlist is a pipeline, not a pile. Status moves a save through
 * triage and persists through PATCH /api/watchlist.
 */
const WL_STATUSES = ["watching", "reviewing", "contacted", "passed"] as const;
type WlStatus = typeof WL_STATUSES[number];
const WL_KEY: Record<WlStatus, string> = {
  watching: "watchlist.stWatching", reviewing: "watchlist.stReviewing",
  contacted: "watchlist.stContacted", passed: "watchlist.stPassed",
};

type SavedStartup = NonNullable<Watchlist["startup"]>;

/**
 * One saved company: the row opens the listing (a real link, so the detail
 * page counts the visit), priority, the status select and the note sit above
 * the link.
 *
 * The note says why the company was saved. It saves on blur rather than
 * behind a button: this is a scratchpad, and a Save press on a one-line
 * thought is how the field goes unused. Every write is gated on the ReadOnly
 * context, because in view-as these APIs authenticate as the admin.
 */
function WatchlistRow({ startup, note, status, priority, onStatus, onPriority }: {
  startup: SavedStartup; note: string | null; status: WlStatus; priority: number;
  onStatus: (next: WlStatus) => void; onPriority: (next: number) => void;
}) {
  const { t, tf } = useStrings();
  const readOnly = useReadOnly();
  const [statusBusy, setStatusBusy] = useState(false);
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [saved, setSaved] = useState(note ?? "");
  const [draft, setDraft] = useState(note ?? "");
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const priorityLabel = tf("watchlist.priorityLabel", "Priority");

  async function patchStatus(next: WlStatus) {
    if (readOnly || statusBusy) return;
    const prev = status;
    onStatus(next);
    setStatusBusy(true);
    const res = await fetch("/api/watchlist", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId: startup.id, status: next }),
    }).catch(() => null);
    setStatusBusy(false);
    if (!res?.ok) { onStatus(prev); notify.error(t("errors.generic")); }
  }

  // Three dots, click to set, click the current one to clear (0-3, C26).
  async function patchPriority(next: number) {
    if (readOnly || priorityBusy) return;
    const prev = priority;
    onPriority(next);
    setPriorityBusy(true);
    const res = await fetch("/api/watchlist", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId: startup.id, priority: next }),
    }).catch(() => null);
    setPriorityBusy(false);
    if (!res?.ok) { onPriority(prev); notify.error(t("errors.generic")); }
  }

  async function persist() {
    setEditing(false);
    if (cancelled.current) { cancelled.current = false; setDraft(saved); return; }
    if (readOnly) return;
    const next = draft.trim();
    if (next === saved) return;
    const prev = saved;
    setSaved(next);
    const res = await fetch("/api/watchlist", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId: startup.id, note: next || null }),
    }).catch(() => null);
    if (!res?.ok) { setSaved(prev); setDraft(prev); notify.error(t("dashboard.noteSaveFailed")); }
  }

  const raise = safeFormatCurrencyAmount(startup.funding_target);
  const meta = [stageLabel(startup.stage), startup.industry].filter(Boolean).join(" · ");

  return (
    <LedgerRow href={`/startups/${startup.slug}`} label={startup.name} className={status === "passed" ? "crd-passed" : undefined}>
      <LedgerCell primary>
        <span className="cr-row-title">{startup.name}</span>
        {meta && <span className="cr-row-sub">{meta}</span>}
        {editing ? (
          <textarea
            ref={fieldRef}
            id={fieldId}
            className="cr-input cr-row__raised crd-note-field"
            autoFocus
            rows={2}
            maxLength={1000}
            value={draft}
            aria-label={tf("dashboard.investor.noteFor", "Note on {name}", { name: startup.name })}
            placeholder={t("dashboard.notePlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={persist}
            onKeyDown={(e) => {
              // Focus returns to the toggle, and the blur that causes saves.
              if (e.key === "Escape") { e.preventDefault(); cancelled.current = true; toggleRef.current?.focus(); }
              // Shift+Enter keeps the newline; notes run to a couple of lines.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); toggleRef.current?.focus(); }
            }}
          />
        ) : saved ? (
          <p className="crd-note">{saved}</p>
        ) : null}
      </LedgerCell>
      <LedgerCell figure>{raise === FORMATTER_DASH ? <NotStated /> : raise}</LedgerCell>
      <LedgerCell align="end">
        <div className="crd-controls">
          {!readOnly && (
            <button
              ref={toggleRef}
              type="button"
              className="cr-btn cr-btn--text cr-row__raised"
              aria-expanded={editing}
              aria-controls={editing ? fieldId : undefined}
              // Keeps focus in the field so this press commits instead of reopening.
              onMouseDown={(e) => { if (editing) e.preventDefault(); }}
              onClick={() => { if (editing) fieldRef.current?.blur(); else setEditing(true); }}
            >
              {saved ? tf("dashboard.investor.editNote", "Edit note") : t("dashboard.addNote")}
            </button>
          )}
          <div className="crd-priority cr-row__raised" role="group" aria-label={priorityLabel}>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                className="crd-priority-dot"
                disabled={readOnly}
                aria-pressed={priority >= n}
                aria-label={`${priorityLabel} ${n}`}
                data-on={priority >= n || undefined}
                onClick={() => void patchPriority(priority === n ? 0 : n)}
              />
            ))}
          </div>
          <select
            className="cr-select cr-row__raised"
            value={status}
            disabled={readOnly}
            aria-label={tf("dashboard.investor.statusFor", "Status of {name}", { name: startup.name })}
            onChange={(e) => void patchStatus(e.target.value as WlStatus)}
          >
            {WL_STATUSES.map((s) => <option key={s} value={s}>{t(WL_KEY[s])}</option>)}
          </select>
        </div>
      </LedgerCell>
    </LedgerRow>
  );
}

function WatchlistSection({ watchlist, canExport, showBrowse }: { watchlist: Watchlist[]; canExport: boolean; showBrowse: boolean }) {
  const { t, tf } = useStrings();
  const [statusById, setStatusById] = useState<Record<string, WlStatus>>(() =>
    Object.fromEntries(watchlist.map((w) => [w.id, (w.status ?? "watching") as WlStatus])),
  );
  const [priorityById, setPriorityById] = useState<Record<string, number>>(() =>
    Object.fromEntries(watchlist.map((w) => [w.id, w.priority ?? 0])),
  );
  const [filter, setFilter] = useState<WlStatus | null>(null);
  const saved = watchlist.filter((w): w is Watchlist & { startup: SavedStartup } => Boolean(w.startup));
  const statusOf = (w: Watchlist): WlStatus => statusById[w.id] ?? "watching";
  const priorityOf = (w: Watchlist): number => priorityById[w.id] ?? w.priority ?? 0;

  function exportCsv() {
    if (saved.length === 0) return;
    // Every cell quoted: a tagline is free text, and one comma in it shifts
    // every later column of that row.
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      t("watchlist.statusLabel"), t("watchlist.priorityLabel"), t("dashboard.startupLabel"),
      tf("dashboard.investor.csvTagline", "Tagline"), t("filters.industry"), t("filters.stage"),
      tf("dashboard.investor.csvTarget", "Funding target"), t("startupDetail.mrr"),
    ];
    const lines = saved.map((w) => [
      t(WL_KEY[statusOf(w)]), priorityOf(w), w.startup.name, w.startup.tagline, w.startup.industry,
      stageLabel(w.startup.stage), w.startup.funding_target, w.startup.mrr,
    ].map(esc).join(","));
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "capitalreach-watchlist.csv"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const visible = filter ? saved.filter((w) => statusOf(w) === filter) : saved;
  // Triage by status earns a control only once the list is long enough to scan.
  const showFilter = saved.length >= 8;
  const showExport = canExport && saved.length > 0;
  const end = showFilter || showExport ? (
    <>
      {showFilter && (
        <FilterMenu<WlStatus>
          label={t("dashboard.statusLabel")}
          options={WL_STATUSES.map((s) => ({ value: s, label: t(WL_KEY[s]), count: saved.filter((w) => statusOf(w) === s).length }))}
          multiple={false}
          value={filter}
          onChange={setFilter}
          align="end"
        />
      )}
      {showExport && (
        <button type="button" className="cr-btn cr-btn--text" onClick={exportCsv}>{t("dashboard.exportCsv")}</button>
      )}
    </>
  ) : undefined;

  const meta = saved.length === 0 ? undefined
    : saved.length === 1 ? t("dashboard.savedCountOne") : t("dashboard.savedCount", { count: saved.length });

  return (
    <Section id="watchlist" title={t("dashboard.watchlist")} meta={meta} end={end}>
      {saved.length === 0 ? (
        <EmptyState
          title={t("dashboard.noSavedYet")}
          action={showBrowse ? <Link href="/startups" className="cr-link">{t("dashboard.browseStartups")}</Link> : undefined}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={tf("dashboard.investor.noStatusMatch", "No saved companies have this status.")}
          action={
            <button type="button" className="cr-btn cr-btn--text crd-flush" onClick={() => setFilter(null)}>
              {tf("dashboard.investor.showAll", "Show all")}
            </button>
          }
        />
      ) : (
        <Ledger
          columns="minmax(0,1fr) auto auto"
          /* Opt-in separated variant (globals.css "Ledger: separated
             variant") -- same class the investor directory uses: each row
             is a distinct saved company, not a line in a dense table. */
          className="cr-ledger--separated"
          head={
            <LedgerHead>
              <LedgerCell>{t("dashboard.startupLabel")}</LedgerCell>
              <LedgerCell figure>{tf("dashboard.investor.colRaising", "Raising")}</LedgerCell>
              <LedgerCell align="end">{t("dashboard.statusLabel")}</LedgerCell>
            </LedgerHead>
          }
        >
          {visible.map((w) => (
            <WatchlistRow
              key={w.id}
              startup={w.startup}
              note={w.note ?? null}
              status={statusOf(w)}
              priority={priorityOf(w)}
              onStatus={(next) => setStatusById((prev) => ({ ...prev, [w.id]: next }))}
              onPriority={(next) => setPriorityById((prev) => ({ ...prev, [w.id]: next }))}
            />
          ))}
        </Ledger>
      )}
    </Section>
  );
}

// ── Positions ───────────────────────────────────────────────────────────────

/**
 * D40 + D43: closed deals as positions, with the allocation target in the
 * section head for plans that track it. Deployed and committed are computed
 * from deals server-side so they cannot drift; the target is the investor's.
 */
function PositionsSection({ positions, investor, allocation, canTrack, canExport }: {
  positions: PortfolioPosition[]; investor: Investor; allocation?: { committed: number; deployed: number }; canTrack: boolean; canExport: boolean;
}) {
  const { t, tf } = useStrings();
  const readOnly = useReadOnly();
  const inv = investor as unknown as { allocation_target?: number | null; allocation_period?: string | null; currency?: string | null };
  const cur = inv.currency || "USD";
  const [target, setTarget] = useState<number | null>(inv.allocation_target ?? null);
  const [period, setPeriod] = useState(inv.allocation_period ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [periodDraft, setPeriodDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const errorId = `${formId}-error`;

  // A sum across currencies would be a number nobody holds.
  const currencies = new Set(positions.map((p) => p.currency));
  const total = positions.reduce((a, p) => a + (p.amount ?? 0), 0);
  const totalText = currencies.size === 1 && total > 0 ? formatMoney(total, positions[0].currency) : null;

  const summary = allocationSummary(target, allocation?.committed ?? 0, allocation?.deployed ?? 0);
  const targetText = summary.target !== null
    ? `${formatMoney(summary.target, cur, { compact: true })}${period ? ` · ${period}` : ""}`
    : null;
  const remainingText = canTrack && summary.remaining ? formatMoney(summary.remaining, cur, { compact: true }) : null;

  function openForm() {
    setDraft(target ? String(target) : "");
    setPeriodDraft(period);
    setInvalid(false);
    setEditing(true);
  }
  function closeForm() {
    setEditing(false);
    setInvalid(false);
    toggleRef.current?.focus();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    const raw = draft.trim();
    let next: number | null = null;
    if (raw !== "") {
      const n = Number(raw.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(n) || n <= 0) { setInvalid(true); return; }
      next = n;
    }
    const nextPeriod = periodDraft.trim().slice(0, 40);
    const prev = { target, period };
    setTarget(next);
    setPeriod(nextPeriod);
    closeForm();
    const res = await fetch("/api/investors/allocation", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: next, period: nextPeriod || null }),
    }).catch(() => null);
    if (!res?.ok) { setTarget(prev.target); setPeriod(prev.period); notify.error(t("errors.generic")); }
  }

  const meta = totalText || remainingText ? (
    <span className="crd-meta">
      {totalText && <span>{t("dashboard.totalDeployed")}</span>}
      {totalText && <span className="crd-figure-lg">{totalText}</span>}
      {remainingText && <span>{tf("dashboard.investor.remaining", "{amount} remaining", { amount: remainingText })}</span>}
    </span>
  ) : undefined;

  const markUp = (p: PortfolioPosition) =>
    p.valuationAtClose && p.currentValuation && p.valuationAtClose > 0
      ? Math.round((p.currentValuation / p.valuationAtClose - 1) * 100)
      : null;

  // Same CSV-escaping/download pattern as WatchlistSection's exportCsv: every
  // cell quoted, since a listing name or update title is free text and one
  // stray comma shifts every later column of that row.
  const showExport = canExport && positions.length > 0;
  function exportCsv() {
    if (positions.length === 0) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      t("dashboard.startupLabel"),
      tf("dashboard.investor.csvStatus", "Status"),
      t("dashboard.amountLabel"), tf("dashboard.investor.csvCurrency", "Currency"),
      t("portfolio.ownership"),
      tf("dashboard.investor.csvValuationClose", "Valuation at close"),
      tf("dashboard.investor.csvValuationCurrent", "Current valuation"),
      t("portfolio.markChange"),
      tf("dashboard.investor.csvClosedDate", "Closed date"),
      t("portfolio.latestUpdate"),
      tf("dashboard.investor.csvProfile", "Profile"),
    ];
    const lines = positions.map((p) => {
      const listed = p.status === "active";
      const mu = markUp(p);
      return [
        p.name, listed ? tf("dashboard.investor.csvListed", "Listed") : t("portfolio.notListed"),
        p.amount ?? "", p.currency,
        p.ownershipPercent != null ? `${p.ownershipPercent.toFixed(2)}%` : "",
        p.valuationAtClose ?? "", p.currentValuation ?? "",
        mu != null ? `${mu > 0 ? "+" : ""}${mu}%` : "",
        p.closedAt ? formatDate(p.closedAt) : "",
        p.latestUpdate ? `${p.latestUpdate.title} · ${formatDate(p.latestUpdate.created_at)}` : t("portfolio.noUpdates"),
        listed ? `${window.location.origin}/startups/${p.slug}` : `${window.location.origin}/deals?deal=${p.dealId}`,
      ].map(esc).join(",");
    });
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "capitalreach-positions.csv"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const targetControl = !canTrack ? undefined
    : readOnly
      ? (targetText ? <span className="crd-end-text">{tf("dashboard.investor.target", "Target {amount}", { amount: targetText })}</span> : undefined)
      : (
        <button
          ref={toggleRef}
          type="button"
          className="cr-btn cr-btn--text"
          aria-expanded={editing}
          aria-controls={editing ? formId : undefined}
          onClick={() => (editing ? closeForm() : openForm())}
        >
          {targetText ? tf("dashboard.investor.targetEdit", "Target {amount}, edit", { amount: targetText }) : t("allocation.set")}
        </button>
      );
  const end = targetControl || showExport ? (
    <>
      {targetControl}
      {showExport && (
        <button type="button" className="cr-btn cr-btn--text" onClick={exportCsv}>{t("dashboard.exportCsv")}</button>
      )}
    </>
  ) : undefined;

  return (
    <Section id="positions" title={tf("dashboard.investor.positionsTitle", "Positions")} meta={meta} end={end}>
      {editing && !readOnly && (
        <form id={formId} className="crd-alloc" onSubmit={save} noValidate>
          <label>
            {t("allocation.targetPh")}
            <input
              className="cr-input"
              inputMode="decimal"
              autoFocus
              value={draft}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              onChange={(e) => { setDraft(e.target.value); if (invalid) setInvalid(false); }}
            />
          </label>
          <label>
            {t("allocation.periodPh")}
            <input className="cr-input" maxLength={40} value={periodDraft} onChange={(e) => setPeriodDraft(e.target.value)} />
          </label>
          <button type="submit" className="cr-btn">{t("common.save")}</button>
          <button type="button" className="cr-btn cr-btn--text" onClick={closeForm}>{t("common.cancel")}</button>
          {invalid && (
            <p id={errorId} className="crd-field-error">
              {tf("dashboard.investor.targetInvalid", "Enter the target as a number, like 250000.")}
            </p>
          )}
        </form>
      )}
      <Ledger
        columns="minmax(0,1fr) auto auto auto"
        head={
          <LedgerHead>
            <LedgerCell>{t("dashboard.startupLabel")}</LedgerCell>
            <LedgerCell figure>{t("dashboard.amountLabel")}</LedgerCell>
            <LedgerCell figure>{t("portfolio.ownership")}</LedgerCell>
            <LedgerCell figure>{t("portfolio.markChange")}</LedgerCell>
          </LedgerHead>
        }
      >
        {positions.map((p) => {
          const mu = markUp(p);
          const amount = compactMoney(p.amount, p.currency);
          const update = p.latestUpdate
            ? `${t("portfolio.latestUpdate")}: ${p.latestUpdate.title} · ${formatDate(p.latestUpdate.created_at)}`
            : t("portfolio.noUpdates");
          // D41: a company that archived its listing is still yours; its deal
          // record is where the position lives once the listing is gone.
          const listed = p.status === "active";
          return (
            <LedgerRow key={p.dealId} href={listed ? `/startups/${p.slug}` : `/deals?deal=${p.dealId}`} label={p.name}>
              <LedgerCell primary>
                <span className="cr-row-title">{p.name}</span>
                <span className="cr-row-sub">{listed ? update : `${t("portfolio.notListed")} · ${update}`}</span>
              </LedgerCell>
              <LedgerCell figure>{amount ?? <NotStated />}</LedgerCell>
              <LedgerCell figure>
                <span className="crd-mlabel">{t("portfolio.ownership")}</span>
                {p.ownershipPercent != null ? `${p.ownershipPercent.toFixed(2)}%` : <NotStated />}
              </LedgerCell>
              <LedgerCell figure>
                <span className="crd-mlabel">{t("portfolio.markChange")}</span>
                {mu === null ? <NotStated /> : (
                  <span className={mu > 0 ? "crd-up" : mu < 0 ? "crd-down" : undefined}>{`${mu > 0 ? "+" : ""}${mu}%`}</span>
                )}
              </LedgerCell>
            </LedgerRow>
          );
        })}
      </Ledger>
    </Section>
  );
}

// ── Reports ─────────────────────────────────────────────────────────────────

type ReportItem = {
  id: string; type: string; content: string; created_at: string;
  startup?: { name: string; slug: string } | null; dealId?: string | null;
};

const REPORT_TYPE: Record<string, readonly [string, string]> = {
  due_diligence:  ["dashboard.investor.reportDueDiligence", "Due diligence"],
  startup_score:  ["dashboard.investor.reportScore", "Consistency score"],
  pitch_feedback: ["dashboard.investor.reportPitch", "Pitch feedback"],
  match:          ["dashboard.investor.reportMatch", "Match"],
};

/**
 * C36: every report, each opening in place with export, delete and the links
 * to its listing and deal. The server hands over the first ten; the client
 * reads the full list, except in view-as, where that API answers as the admin.
 */
function ReportsSection({ initial, live }: { initial: AiReport[]; live: boolean }) {
  const { t, tf } = useStrings();
  const readOnly = useReadOnly();
  const [reports, setReports] = useState<ReportItem[]>(initial as unknown as ReportItem[]);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!live) return;
    fetch("/api/ai/reports")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.reports) setReports(j.reports); })
      .catch(() => {});
  }, [live]);

  const del = useUndoableDelete(async (id) => {
    const res = await fetch("/api/ai/reports", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), keepalive: true,
    }).catch(() => null);
    if (!res?.ok) { notify.error(t("errors.generic")); return false; }
    setReports((prev) => prev.filter((r) => r.id !== id));
    return true;
  });

  const typeLabel = (type: string) => {
    const entry = REPORT_TYPE[type];
    return entry ? tf(entry[0], entry[1]) : tf("dashboard.investor.reportGeneric", "Report");
  };

  const toggle = (id: string) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  function exportReport(r: ReportItem) {
    const name = r.startup?.name ?? tf("dashboard.investor.reportGeneric", "Report");
    const md = `# ${name}: ${typeLabel(r.type)}\n\n_${new Date(r.created_at).toLocaleString(displayLocale())}_\n\n${r.content}\n\n---\n${tf("dashboard.investor.reportDisclaimer", "AI-generated for informational purposes only. Not investment advice.")}\n`;
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${r.type}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const visible = reports.filter((r) => !del.isHidden(r.id));
  if (visible.length === 0 && !del.pending) return null;

  return (
    <Section id="reports" title={tf("dashboard.investor.reportsTitle", "Reports")}>
      {visible.length > 0 && (
        <Ledger columns="minmax(0,1fr) auto">
          {visible.map((r) => {
            const open = openIds.has(r.id);
            const panelId = `report-${r.id}`;
            const name = r.startup?.name ?? tf("dashboard.investor.reportGeneric", "Report");
            return (
              <LedgerRow key={r.id}>
                <LedgerCell primary>
                  <span className="cr-row-title">{name}</span>
                  <span className="cr-row-sub">{`${typeLabel(r.type)} · ${formatDate(r.created_at)}`}</span>
                </LedgerCell>
                <LedgerCell className="crd-toggle-cell">
                  <button
                    type="button"
                    className="cr-btn cr-btn--text"
                    aria-expanded={open}
                    aria-controls={open ? panelId : undefined}
                    aria-label={`${open ? t("common.close") : t("common.open")}: ${name}`}
                    onClick={() => toggle(r.id)}
                  >
                    {open ? t("common.close") : t("common.open")}
                  </button>
                </LedgerCell>
                {open && (
                  <LedgerCell className="crd-expand">
                    <div id={panelId}>
                      <p className="crd-report">{r.content}</p>
                      <div className="crd-actions">
                        {r.startup?.slug && (
                          <Link href={`/startups/${r.startup.slug}`} className="cr-btn cr-btn--text crd-flush">{t("dashboard.viewStartup")}</Link>
                        )}
                        {r.dealId && (
                          <Link href={`/deals?deal=${r.dealId}`} className="cr-btn cr-btn--text">{t("dashboard.reportViewDeal")}</Link>
                        )}
                        <button type="button" className="cr-btn cr-btn--text" onClick={() => exportReport(r)}>
                          {t("dashboard.reportExport")}
                        </button>
                        {!readOnly && (
                          <button type="button" className="cr-btn cr-btn--text" onClick={() => { toggle(r.id); del.remove(r.id); }}>
                            {t("common.delete")}
                          </button>
                        )}
                      </div>
                    </div>
                  </LedgerCell>
                )}
              </LedgerRow>
            );
          })}
        </Ledger>
      )}
      <UndoFoot
        pendingId={del.pending}
        message={tf("dashboard.investor.reportDeleted", "Report deleted.")}
        onUndo={del.undo}
      />
    </Section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function InvestorDashboardClient({ profile, investor, watchlist, deals, aiReports, viewingAs, allocation, portfolio = [], isLaunchMode = false }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { t, tf, tfn } = useStrings();
  const messagingAvailable = useMessagingAvailable();
  const live = !viewingAs;

  // Arrival notices: async outcomes the investor cannot otherwise see.
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

  // One capability object instead of legacy tier-string checks. isLaunchMode
  // comes from the server, so the client gates exactly what the server grants.
  const caps = investorCan(buildAccessContext(profile, isLaunchMode));

  const savedCount = watchlist.filter((w) => w.startup).length;
  const inDeals = deals.filter((d) => d.status !== "closed" && d.status !== "passed").length;
  const name = investor.display_name || profile.full_name || t("dashboard.yourPortfolio");

  return (
    <ReadOnlyProvider value={!!viewingAs}>
    <style dangerouslySetInnerHTML={{ __html: DASH_CSS }} />
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>

      {/* Every write path below is gated on the ReadOnly context, because the
          APIs authenticate as the admin: an ungated click would write to the
          admin's own account while appearing to act on this investor's. */}
      {viewingAs && (
        <div role="status" className="crd-viewas">
          <span>{t("viewAs.banner", { name: viewingAs })}</span>
          <span>{t("viewAs.readOnly")}</span>
          <Link href="/admin">{t("viewAs.exit")}</Link>
        </div>
      )}

      <div className="crd-page">
        <PageHeader
          title={name}
          count={savedCount > 0 ? tfn("dashboard.investor.headSaved", savedCount, "{count} saved", "{count} saved") : null}
          meta={inDeals > 0 ? tfn("dashboard.investor.headInDeals", inDeals, "{count} in deals", "{count} in deals") : undefined}
          // Hidden in view-as: it navigates the admin's own inbox and silently
          // leaves the impersonation; the banner owns the exit.
          end={live && messagingAvailable === true
            ? <Link href="/dashboard/messages" className="cr-btn cr-btn--text">{t("dashboard.messages")}</Link>
            : undefined}
        />

        <ErrorBoundary labelKey="sections.needsAttention">
          <WaitingOnYou deals={deals} investor={investor} live={live} />
        </ErrorBoundary>

        {/* Reads the caller's own watch history; in view-as that is the admin's. */}
        {live && <ErrorBoundary labelKey="sections.recentlyViewed"><WatchlistChanges /></ErrorBoundary>}

        {/* Reads the caller's own engagement/view history; in view-as both
            would answer as the admin, not the member being viewed. */}
        {live && <ErrorBoundary labelKey="sections.profileViewers"><ProfileViewersSection /></ErrorBoundary>}
        {live && <ErrorBoundary labelKey="sections.recentlyViewed"><JumpBackInSection /></ErrorBoundary>}

        <WatchlistSection watchlist={watchlist} canExport={caps.dataExport} showBrowse={live} />

        {caps.portfolio && portfolio.length > 0 && (
          <ErrorBoundary labelKey="dashboard.portfolio">
            <PositionsSection positions={portfolio} investor={investor} allocation={allocation} canTrack={caps.allocationTracking} canExport={caps.dataExport} />
          </ErrorBoundary>
        )}

        <ReportsSection initial={aiReports} live={live} />

        {live && (
          <div className="crd-foot">
            {/* InvitePanel owns its own trigger and its own expand/collapse
                (see invite-panel.tsx) -- both dashboards mount it directly,
                per its own doc comment. This surface used to wrap it in a
                SECOND "Invite a founder" toggle that only revealed the
                panel's own identical "Invite a founder" trigger underneath,
                which read as one button leading nowhere but to another copy
                of itself. Removing the outer wrapper leaves exactly one
                trigger, exactly like the founder dashboard's InvitePanel
                mount (components/dashboard/startup-dashboard-client.tsx). */}
            <div className="crd-foot-links">
              <SavedSearchesLink enabled={caps.savedSearches} />
            </div>
            <div className="crd-foot-panel">
              <InvitePanel defaultRole="startup" />
            </div>
          </div>
        )}
      </div>
    </main>
    </ReadOnlyProvider>
  );
}
