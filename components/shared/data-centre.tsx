"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { displayLocale } from "@/lib/display-locale";
import { STAGE_LABELS } from "@/lib/utils";
import { MAX_PLAUSIBLE_AMOUNT, safeFormatCurrency } from "@/lib/format";
import { InfoTip } from "@/components/shared/info-tip";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/page-header";
import { Ledger, LedgerCell, LedgerHead, LedgerRow, Section } from "@/components/ui/ledger";
import { Skeleton } from "@/components/ui/Skeleton";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";

/* Hallmark · genre: modern-minimal · macrostructure: stat-led with a worded lead,
   tally strip, ledger · pre-emit critique: P5 H5 E4 S5 R5 V4 */

interface TopStartup {
  name: string;
  slug: string;
  industry: string;
  stage: string;
  mrr: number | null;
  ai_score: number | null;
  funding_target: number | null;
  created_at: string;
}

interface PlatformMonth { month: string; listings: number; closed: number; sought: number }

interface PlatformData {
  sampleCount?: number;
  startupCount: number;
  investorCount: number;
  totalRaised: number;
  dealsCount: number;
  byDealStage: Record<string, number>;
  activeDeals: number;
  closeRate: number | null;
  closedCurrencies: string[];
  byIndustry: Record<string, number>;
  byStage: Record<string, number>;
  topStartups: TopStartup[];
  recentStartups: TopStartup[];
  monthly?: PlatformMonth[];
  report?: { medianByStage: Record<string, number>; medianCountByStage?: Record<string, number>; newThisMonth: number };
  lastUpdated: string;
}

// Data thresholds. Below each one the view it gates says nothing true.
const BREAKDOWN_MIN_LISTINGS = 8;
const MEDIAN_MIN_N = 3; // lib/platform-data withholds smaller stages before they reach the client
const CLOSE_RATE_MIN_CONCLUDED = 5;
const SCORE_MIN_SCORED = 3;
const STRIP_MAX_UNITS = 12;

const OPEN_STAGES = [
  { key: "intro", tkey: "data.lead.dealsIntro", one: "{count} deal at introduction.", other: "{count} deals at introduction." },
  { key: "due_diligence", tkey: "data.lead.dealsDiligence", one: "{count} deal in diligence.", other: "{count} deals in diligence." },
  { key: "term_sheet", tkey: "data.lead.dealsTermSheet", one: "{count} deal at term sheet.", other: "{count} deals at term sheet." },
] as const;

const SANS = "var(--font-dm-sans), system-ui, sans-serif";

const FRAME: CSSProperties = {
  maxWidth: "68.75rem",
  marginInline: "auto",
  paddingInline: "clamp(1.5rem, 5vw, 2rem)",
  paddingBlockEnd: "4rem",
};

const LEAD: CSSProperties = {
  borderBlockStart: "1px solid var(--cr-rule-dark)",
  paddingBlockStart: "1.5rem",
  marginBlockEnd: "3rem",
};

// The page's one display figure (S3): serif 600, roman, tabular.
const FIG_LEAD: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-serif)",
  fontWeight: 600,
  fontStyle: "normal",
  fontSize: "clamp(2.5rem, 5vw + 1rem, 4rem)",
  lineHeight: 1.1,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums",
  fontOpticalSizing: "auto",
  fontVariationSettings: "'SOFT' 0, 'WONK' 0",
  color: "var(--cr-ink)",
};

const SENTENCE: CSSProperties = {
  margin: 0,
  marginBlockStart: "0.75rem",
  maxWidth: "60ch",
  fontFamily: SANS,
  fontSize: "0.9375rem",
  fontWeight: 400,
  lineHeight: 1.55,
  color: "var(--cr-ink-2)",
};

const SMALL: CSSProperties = {
  margin: 0,
  fontFamily: SANS,
  fontSize: "0.8125rem",
  fontWeight: 400,
  lineHeight: 1.4,
  color: "var(--cr-ink-3)",
  fontVariantNumeric: "tabular-nums",
};

const SQUARE: CSSProperties = { display: "block", flex: "none", width: "0.625rem", height: "0.625rem" };
const SLOT_EDGE = "1px dashed var(--cr-ink-4)";

// A 44px hit area that occupies one line of layout in a section head.
const HEAD_LINK: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "2.75rem",
  marginBlock: "-0.625rem",
  fontFamily: SANS,
  fontSize: "0.8125rem",
  whiteSpace: "nowrap",
};

// Inner row links sit above the row overlay. Vertical padding widens the hit
// area without moving the line; it stays short of the name line above.
const INNER_LINK: CSSProperties = { whiteSpace: "nowrap", paddingBlock: "0.25rem" };

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

function monthDate(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function formatMonth(key: string, month: "short" | "long", withYear = false) {
  return new Intl.DateTimeFormat(displayLocale(), {
    month, ...(withYear ? { year: "numeric" as const } : {}), timeZone: "UTC",
  }).format(monthDate(key));
}

function formatDay(iso: string, withYear: boolean) {
  return new Intl.DateTimeFormat(displayLocale(), {
    day: "numeric", month: "short", ...(withYear ? { year: "numeric" as const } : {}), timeZone: "UTC",
  }).format(new Date(iso));
}

function formatCount(n: number) {
  return new Intl.NumberFormat(displayLocale()).format(n);
}

function formatRaised(total: number, currencies: string[]) {
  const locale = displayLocale();
  if (currencies.length === 1) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency", currency: currencies[0], notation: "compact", maximumFractionDigits: 1,
      }).format(total);
    } catch { /* not an ISO code: a plain figure follows */ }
  }
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(total);
}

function listJoin(items: string[]) {
  try {
    return new Intl.ListFormat(displayLocale(), { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

function stageLabel(stage: string) {
  const words = stage.replace(/[_-]+/g, " ");
  return STAGE_LABELS[stage] ?? words.charAt(0).toUpperCase() + words.slice(1);
}

function isStatedTarget(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= MAX_PLAUSIBLE_AMOUNT;
}

/**
 * Twelve months as a unit tally: one square per listing (ink) and per closed
 * deal (--cr-up) stacked on one baseline. Empty months draw nothing. The
 * month still being written is a dashed slot. No axis, hover or legend for an
 * empty series; the accessible name and the sr-only table carry the numbers.
 */
function MonthStrip({ months, inProgressKey, ariaLabel, soFarLabel, keyLabels }: {
  months: PlatformMonth[];
  inProgressKey: string | null;
  ariaLabel: string;
  soFarLabel: string;
  keyLabels: { listing: string; closed: string } | null;
}) {
  const last = months.length - 1;
  return (
    <div role="img" aria-label={ariaLabel} style={{ paddingBlockStart: "1.5rem" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${months.length}, minmax(0, 3.5rem))`,
        gridTemplateRows: "minmax(2.5rem, auto) 1px auto",
        columnGap: "0.5rem",
      }}>
        {months.map((m, i) => {
          const marks = [
            ...Array.from({ length: m.listings }, (_, k) => (
              <span key={`l${k}`} style={{ ...SQUARE, background: "var(--cr-ink-2)" }} />
            )),
            ...Array.from({ length: m.closed }, (_, k) => (
              <span key={`c${k}`} style={{ ...SQUARE, background: "var(--cr-up)" }} />
            )),
          ];
          return (
            <div key={m.month} style={{
              gridColumn: i + 1, gridRow: 1, minWidth: 0,
              display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: "0.25rem",
            }}>
              {m.month === inProgressKey ? (
                <span style={{
                  boxSizing: "content-box", width: "0.625rem", minHeight: "2.5rem",
                  borderBlockStart: SLOT_EDGE, borderInlineStart: SLOT_EDGE, borderInlineEnd: SLOT_EDGE,
                  display: "flex", flexDirection: "column-reverse", gap: "0.25rem",
                }}>
                  {marks}
                </span>
              ) : marks}
            </div>
          );
        })}
        <div style={{ gridColumn: "1 / -1", gridRow: 2, background: "var(--cr-rule-dark)" }} />
        {months.map((m, i) => {
          const inProgress = m.month === inProgressKey;
          // Below md only every third month is named, counted back from the
          // newest, so labels never collide in 20px columns.
          const quarterly = (last - i) % 3 === 0;
          return (
            <div key={`${m.month}-label`} className={quarterly ? "flex" : "hidden md:flex"} style={{
              gridColumn: i + 1, gridRow: 3, minWidth: 0,
              justifyContent: inProgress ? "flex-end" : "center",
              paddingBlockStart: "0.5rem",
            }}>
              <span style={{ ...SMALL, whiteSpace: "nowrap", textAlign: inProgress ? "end" : "center" }}>
                {formatMonth(m.month, "short")}
                {inProgress && <><br />{soFarLabel}</>}
              </span>
            </div>
          );
        })}
      </div>
      {keyLabels && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", marginBlockStart: "0.75rem" }}>
          {[{ label: keyLabels.listing, tone: "var(--cr-ink-2)" }, { label: keyLabels.closed, tone: "var(--cr-up)" }].map((k) => (
            <span key={k.label} style={{ ...SMALL, display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ ...SQUARE, background: k.tone }} />
              {k.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function DataCentre({ initialData, canListRound = false }: {
  initialData?: PlatformData | null;
  /** A startup-role viewer with no listing: the only audience for the closing link. */
  canListRound?: boolean;
} = {}) {
  const { t } = useTranslation();
  // New keys carry their English until the dictionaries have them; t() echoes
  // an unknown key back, which is what the comparison detects.
  const tf = useCallback((key: string, fallback: string, vars?: Record<string, string | number>) => {
    const value = t(key, vars);
    return value === key ? (vars ? fill(fallback, vars) : fallback) : value;
  }, [t]);
  const tp = useCallback((key: string, one: string, other: string, count: number, vars?: Record<string, string | number>) => {
    const all = { ...vars, count };
    const value = t(key, all);
    return value === key ? fill(count === 1 ? one : other, all) : value;
  }, [t]);

  // Server-rendered first paint; the fetch below only runs for retry.
  const [data, setData] = useState<PlatformData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/platform-data");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      if (json.degraded) throw new Error("Degraded");
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // Silent refresh every 60s while visible and on regaining focus. The last
  // good numbers stay on screen through any failure.
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/platform-data");
        if (!res.ok) return;
        const json = await res.json();
        if (!json.degraded) setData(json);
      } catch { /* keep the last good numbers */ }
    };
    const id = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const ready = !loading && !error && !!data;

  return (
    <main style={{ background: "var(--cr-paper)" }}>
      <div style={FRAME}>
        <PageHeader
          title={t("data.title")}
          end={ready ? (
            <p style={SMALL}>
              <time dateTime={data.lastUpdated}>
                {tf("data.lead.asOf", "As of {date}", { date: formatDay(data.lastUpdated, true) })}
              </time>
            </p>
          ) : null}
        />

        {loading && <DataCentreSkeleton label={t("data.loading")} />}

        {!loading && error && (
          <EmptyState
            title={t("data.errorTitle")}
            body={t("data.errorSub")}
            action={
              <button type="button" className="cr-btn cr-btn--text" style={{ marginInlineStart: "-0.5rem" }} onClick={fetchData}>
                {t("data.retry")}
              </button>
            }
          />
        )}

        {ready && data.startupCount === 0 && (
          <EmptyState
            title={t("data.noData")}
            body={canListRound ? t("data.beFirstFounders") : undefined}
            action={canListRound ? (
              <Link href="/onboarding/startup" className="cr-link" style={{ ...HEAD_LINK, marginBlock: 0, color: "var(--cr-ink)" }}>
                {tf("data.lead.listYourRound", "Raising? List your round")}
              </Link>
            ) : undefined}
          />
        )}

        {ready && data.startupCount > 0 && <Report data={data} canListRound={canListRound} t={t} tf={tf} tp={tp} />}
      </div>
    </main>
  );
}

type T = (key: string, vars?: Record<string, string | number>) => string;
type TF = (key: string, fallback: string, vars?: Record<string, string | number>) => string;
type TP = (key: string, one: string, other: string, count: number, vars?: Record<string, string | number>) => string;

function Report({ data, canListRound, t, tf, tp }: { data: PlatformData; canListRound: boolean; t: T; tf: TF; tp: TP }) {
  const monthly = data.monthly ?? [];
  const currentKey = data.lastUpdated.slice(0, 7);
  const inProgressKey = monthly.length > 0 && monthly[monthly.length - 1].month === currentKey ? currentKey : null;
  const anyActivity = monthly.some(m => m.listings > 0 || m.closed > 0);
  const anyClosedMonth = monthly.some(m => m.closed > 0);
  const asLine = monthly.some(m => m.listings + m.closed > STRIP_MAX_UNITS);
  const currencies = data.closedCurrencies ?? [];
  const thisYear = data.lastUpdated.slice(0, 4);

  // ── The lead sentence: every clause is conditional, and none prints a zero.
  const clauses: ReactNode[] = [];
  for (const s of OPEN_STAGES) {
    const n = data.byDealStage?.[s.key] ?? 0;
    if (n > 0) clauses.push(tp(s.tkey, s.one, s.other, n));
  }
  if (data.dealsCount === 0) {
    clauses.push(tf("data.lead.noneClosed", "None closed yet."));
  } else if (data.totalRaised > 0) {
    clauses.push(
      <Fragment key="raised">
        {tp("data.lead.raisedAcross", "{total} raised across {count} closed deal.", "{total} raised across {count} closed deals.",
          data.dealsCount, { total: formatRaised(data.totalRaised, currencies) })}
        {" "}
        <InfoTip termKey="glossary.totalRaised" />
      </Fragment>,
    );
  } else {
    clauses.push(tp("data.lead.closedDeals", "{count} deal closed.", "{count} deals closed.", data.dealsCount));
  }
  const concluded = data.dealsCount + (data.byDealStage?.passed ?? 0);
  if (concluded >= CLOSE_RATE_MIN_CONCLUDED && data.closeRate != null && data.closeRate > 0) {
    clauses.push(tp("data.lead.closeRate", "{rate}% of {count} concluded deal closed.", "{rate}% of {count} concluded deals closed.",
      concluded, { rate: data.closeRate }));
  }
  if (data.investorCount > 0) {
    clauses.push(tp("data.lead.investorsInDirectory", "{count} investor in the directory.", "{count} investors in the directory.", data.investorCount));
  }
  if (monthly.length > 0 && !anyActivity) {
    clauses.push(tf("data.lead.nothingListed", "Nothing listed in the last 12 months."));
  }

  // ── The strip's accessible name, generated from the same months it draws.
  const stripTitle = tf("data.lead.listingsByMonth", "Listings by month");
  const firstMonth = monthly[0]?.month;
  const lastMonth = monthly[monthly.length - 1]?.month;
  const monthRange = firstMonth && lastMonth
    ? tf("data.lead.monthRange", "{from} to {to}", { from: formatMonth(firstMonth, "short", true), to: formatMonth(lastMonth, "short", true) })
    : "";
  const describe = () => {
    const sentences = monthly.flatMap((m) => {
      const inProgress = m.month === inProgressKey;
      if (!inProgress && m.listings === 0 && m.closed === 0) return [];
      const long = formatMonth(m.month, "long", true);
      const name = inProgress ? tf("data.lead.monthSoFar", "{month} so far", { month: long }) : long;
      const items: string[] = [];
      if (m.listings > 0) items.push(tp("data.lead.nListings", "{count} listing", "{count} listings", m.listings));
      if (m.closed > 0) items.push(tp("data.lead.nClosed", "{count} closed deal", "{count} closed deals", m.closed));
      return [tf("data.lead.monthItem", "{month}: {items}.", {
        month: name, items: items.length ? listJoin(items) : tf("data.lead.nothingYet", "nothing yet"),
      })];
    });
    const quietMonths = monthly.some(m => m.month !== inProgressKey && m.listings === 0 && m.closed === 0);
    return [
      tf("data.lead.stripLabel", "Listings by month, {from} to {to}.", {
        from: firstMonth ? formatMonth(firstMonth, "long", true) : "",
        to: lastMonth ? formatMonth(lastMonth, "long", true) : "",
      }),
      ...sentences,
      ...(quietMonths ? [tf("data.lead.otherMonthsNone", "Nothing in the other months.")] : []),
    ].join(" ");
  };

  // ── Breakdowns, each behind the threshold that makes it honest.
  const breakdowns = data.startupCount >= BREAKDOWN_MIN_LISTINGS;
  const industryBars = Object.entries(data.byIndustry ?? {})
    .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ key: label, label, value }));
  const stageBars = Object.entries(data.byStage ?? {})
    .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ key, label: stageLabel(key), value }));
  const medianRows = Object.entries(data.report?.medianByStage ?? {})
    .map(([stage, value]) => ({ stage, value, n: data.report?.medianCountByStage?.[stage] ?? 0 }))
    .filter(r => r.n >= MEDIAN_MIN_N && isStatedTarget(r.value))
    .sort((a, b) => b.n - a.n);

  // ── Rounds. Both named lists arrive empty for a viewer who may not read
  // listing names, so a counted platform with no rows means names withheld.
  const rounds = data.recentStartups ?? [];
  const namesWithheld = rounds.length === 0;
  const showScore = (data.topStartups?.length ?? 0) >= SCORE_MIN_SCORED;
  const notStated = tf("data.lead.notStated", "Not stated");

  return (
    <>
      <div style={LEAD}>
        <p style={{ margin: 0 }}>
          <span style={FIG_LEAD}>{formatCount(data.startupCount)}</span>
          {" "}
          <span className="cr-section-title" style={{ display: "block", marginBlockStart: "0.5rem" }}>
            {tp("data.lead.roundsRaising", "round raising now.", "rounds raising now.", data.startupCount)}
          </span>
        </p>
        {clauses.length > 0 && (
          <p style={SENTENCE}>
            {clauses.map((c, i) => <Fragment key={i}>{i > 0 && " "}{c}</Fragment>)}
          </p>
        )}
        {data.dealsCount > 0 && currencies.length > 1 && (
          <p className="cr-footnote" style={{ marginBlockStart: "0.75rem" }}>
            {t("data.multiCurrencyNote", { list: currencies.join(", ") })}
          </p>
        )}
        {(data.sampleCount ?? 0) > 0 && (
          <p className="cr-footnote" style={{ marginBlockStart: "0.75rem" }}>{t("data.sampleNote")}</p>
        )}
      </div>

      {anyActivity && (
        <Section title={stripTitle} meta={monthRange || undefined}>
          {asLine ? (
            <div style={{ paddingBlockStart: "1.5rem" }}>
              <LineChart
                height={200}
                labels={monthly.filter(m => m.month !== inProgressKey).map(m => formatMonth(m.month, "short"))}
                valueLabel={describe()}
                series={[
                  { key: "listings", label: t("data.newListings"), color: "var(--cr-ink-2)",
                    values: monthly.filter(m => m.month !== inProgressKey).map(m => m.listings) },
                  ...(anyClosedMonth ? [{ key: "closed", label: t("data.dealsClosed"), color: "var(--cr-up)",
                    values: monthly.filter(m => m.month !== inProgressKey).map(m => m.closed) }] : []),
                ]}
              />
            </div>
          ) : (
            <MonthStrip
              months={monthly}
              inProgressKey={inProgressKey}
              ariaLabel={describe()}
              soFarLabel={t("data.soFar")}
              keyLabels={anyClosedMonth
                ? { listing: tf("data.lead.keyListing", "Listing"), closed: tf("data.lead.keyClosed", "Closed deal") }
                : null}
            />
          )}
          <table className="sr-only">
            <caption>{stripTitle}</caption>
            <thead>
              <tr>
                <th scope="col">{t("data.month")}</th>
                <th scope="col">{t("data.newListings")}</th>
                {anyClosedMonth && <th scope="col">{t("data.dealsClosed")}</th>}
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month}>
                  <th scope="row">
                    {m.month === inProgressKey
                      ? tf("data.lead.monthSoFar", "{month} so far", { month: formatMonth(m.month, "long", true) })
                      : formatMonth(m.month, "long", true)}
                  </th>
                  <td>{m.listings}</td>
                  {anyClosedMonth && <td>{m.closed}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {breakdowns && industryBars.length >= 2 && (
        <Section title={tf("data.lead.byIndustry", "By industry")}>
          <div style={{ maxWidth: "36rem", paddingBlockStart: "0.5rem" }}>
            <BarChart
              bars={industryBars}
              caption={tf("data.lead.byIndustry", "By industry")}
              hrefFor={(industry) => `/startups?industries=${encodeURIComponent(industry)}`}
            />
          </div>
        </Section>
      )}

      {breakdowns && stageBars.length >= 2 && (
        <Section title={tf("data.lead.byStage", "By stage")}>
          <div style={{ maxWidth: "36rem", paddingBlockStart: "0.5rem" }}>
            <BarChart
              bars={stageBars}
              caption={tf("data.lead.byStage", "By stage")}
              hrefFor={(stage) => `/startups?stages=${encodeURIComponent(stage)}`}
            />
          </div>
        </Section>
      )}

      {medianRows.length > 0 && (
        <Section title={t("report.medianTarget")}>
          <Ledger
            columns="minmax(0,1fr) auto auto"
            head={
              <LedgerHead>
                <LedgerCell>{t("listings.stage")}</LedgerCell>
                <LedgerCell figure>{tf("data.lead.median", "Median")}</LedgerCell>
                <LedgerCell figure>{tf("data.lead.targetsStated", "Targets stated")}</LedgerCell>
              </LedgerHead>
            }
          >
            {medianRows.map((r) => (
              <LedgerRow key={r.stage}>
                <LedgerCell primary><span className="cr-row-title">{stageLabel(r.stage)}</span></LedgerCell>
                <LedgerCell figure>{safeFormatCurrency(r.value)}</LedgerCell>
                <LedgerCell figure>{formatCount(r.n)}</LedgerCell>
              </LedgerRow>
            ))}
          </Ledger>
        </Section>
      )}

      <Section
        title={tf("data.lead.roundsTitle", "Rounds raising")}
        end={<Link href="/startups" className="cr-link" style={HEAD_LINK}>{t("common.viewAll")}</Link>}
      >
        {namesWithheld ? (
          <p style={{ ...SENTENCE, paddingBlock: "0.25rem" }}>
            {t("data.namesWithheld")}{" "}
            <Link href="/pricing" className="cr-link">{t("common.upgrade")}</Link>
          </p>
        ) : (
          <Ledger
            columns={showScore ? "minmax(0,1fr) auto auto auto" : "minmax(0,1fr) auto auto"}
            head={
              <LedgerHead>
                <LedgerCell>{t("listings.company")}</LedgerCell>
                <LedgerCell figure>{t("listings.raising")}</LedgerCell>
                <LedgerCell align="end" desktopOnly>{tf("data.lead.listed", "Listed")}</LedgerCell>
                {showScore && <LedgerCell figure>{tf("data.lead.score", "Score")}</LedgerCell>}
              </LedgerHead>
            }
          >
            {rounds.map((s) => {
              const stage = s.stage ? stageLabel(s.stage) : "";
              const listed = formatDay(s.created_at, s.created_at.slice(0, 4) !== thisYear);
              return (
                <LedgerRow key={s.slug} href={`/startups/${s.slug}`} label={s.name}>
                  <LedgerCell primary>
                    <span className="cr-row-title">{s.name}</span>
                    <span style={{ ...SMALL, display: "block" }}>
                      {s.industry && (
                        <Link href={`/startups?industries=${encodeURIComponent(s.industry)}`} className="cr-link cr-row__raised" style={INNER_LINK}>
                          {s.industry}
                        </Link>
                      )}
                      {s.industry && stage && <span aria-hidden="true"> · </span>}
                      {stage && (
                        <Link href={`/startups?stages=${encodeURIComponent(s.stage)}`} className="cr-link cr-row__raised" style={INNER_LINK}>
                          {stage}
                        </Link>
                      )}
                      <span className="md:hidden">
                        {(s.industry || stage) && <span aria-hidden="true"> · </span>}
                        <time dateTime={s.created_at}>{listed}</time>
                      </span>
                    </span>
                  </LedgerCell>
                  <LedgerCell figure>
                    {isStatedTarget(s.funding_target)
                      ? safeFormatCurrency(s.funding_target)
                      : <span className="cr-absent">{notStated}</span>}
                  </LedgerCell>
                  <LedgerCell align="end" desktopOnly>
                    <time dateTime={s.created_at} style={SMALL}>{listed}</time>
                  </LedgerCell>
                  {showScore && (
                    <LedgerCell figure>
                      {s.ai_score ? formatCount(s.ai_score) : <span className="cr-absent">{tf("data.lead.notScored", "Not scored")}</span>}
                    </LedgerCell>
                  )}
                </LedgerRow>
              );
            })}
          </Ledger>
        )}
        {!namesWithheld && showScore && <p className="cr-footnote">{t("data.consistencyCaption")}</p>}
      </Section>

      {canListRound && (
        <p style={{ ...SMALL, marginBlockStart: "1.5rem" }}>
          <Link href="/onboarding/startup" className="cr-link" style={{ ...HEAD_LINK, marginBlock: 0, color: "var(--cr-ink)" }}>
            {tf("data.lead.listYourRound", "Raising? List your round")}
          </Link>
        </p>
      )}
    </>
  );
}

/**
 * The report body at its loaded geometry: the lead, the strip, and four
 * ledger rows. app/data/loading.tsx renders it under a header placeholder.
 */
export function DataCentreSkeleton({ label }: { label?: string }) {
  const line = (height: string, width: string, block: string) => (
    <div style={{ height, display: "flex", alignItems: "center" }}>
      <Skeleton w={width} h={block} />
    </div>
  );
  return (
    <div role="status" aria-busy="true">
      {label && <span className="sr-only">{label}</span>}
      <div style={LEAD} aria-hidden="true">
        {line("clamp(2.75rem, 5.5vw + 1.1rem, 4.4rem)", "4rem", "clamp(2rem, 4vw + 0.75rem, 3.25rem)")}
        <div style={{ marginBlockStart: "0.5rem" }}>{line("1.4625rem", "12rem", "1.125rem")}</div>
        <div style={{ marginBlockStart: "0.75rem" }}>{line("1.453rem", "min(32rem, 100%)", "0.9375rem")}</div>
      </div>
      <section className="cr-section" aria-hidden="true">
        <div className="cr-section-head">{line("1.4625rem", "9rem", "1.125rem")}</div>
        <div style={{ paddingBlockStart: "1.5rem" }}>
          <Skeleton w="min(47.5rem, 100%)" h="5.25rem" />
        </div>
      </section>
      <section className="cr-section" aria-hidden="true">
        <div className="cr-section-head">{line("1.4625rem", "8rem", "1.125rem")}</div>
        <div className="cr-ledger" data-head="">
          <div className="cr-colhead"><div className="cr-cell">{" "}</div></div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cr-row">
              <div className="cr-cell cr-cell--primary">
                {line("1.453rem", "10rem", "0.9375rem")}
                {line("1.1375rem", "7rem", "0.8125rem")}
              </div>
              <div className="cr-cell cr-cell--figure">{line("1.453rem", "4rem", "0.9375rem")}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
