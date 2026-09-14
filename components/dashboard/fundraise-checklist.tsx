"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Ledger, LedgerCell, LedgerRow, Section } from "@/components/ui/ledger";
import type { Startup } from "@/types";

/**
 * Next steps: the small number of things still standing between this listing
 * and an investor reading it.
 *
 * Every step is DERIVED from real state, none is a manual checkbox: a
 * checklist you can tick without doing the work is a mood board, and the
 * founder who most needs this is exactly the one who would tick "build a
 * target list" after bookmarking one investor. Ticks here are earned --
 * upload the deck and the deck step stops being listed.
 *
 * Finished steps are not rows. They collapse to a count beside the heading,
 * and when nothing is left the section renders nothing at all. Each row is
 * one link to the place where that step gets done.
 *
 *   <FundraiseChecklist
 *     startup={startup}
 *     completeness={percent}
 *     nextHint="Add your website · +5 points"
 *     attestation={signed ? null : { onSign: readOnly ? undefined : open }}
 *     tractionHref="#round"
 *   />
 */
export function FundraiseChecklist({
  startup,
  completeness,
  nextHint = null,
  attestation = null,
  tractionHref = "#round",
}: {
  startup: Startup;
  completeness: number;
  /** The heaviest gap in the listing, already worded: shown under step one. */
  nextHint?: string | null;
  /** Present only while the founder statement is unsigned. */
  attestation?: { onSign?: () => void } | null;
  /** Where "record traction" goes. The recorder lives in the Round section. */
  tractionHref?: string;
}) {
  const { t } = useTranslation();
  const tf = (key: string, fallback: string, vars?: Record<string, string | number>) => {
    const out = t(key, vars);
    return out === key ? fallback.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`)) : out;
  };
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [metricMonths, setMetricMonths] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/targets").then((r) => (r.ok ? r.json() : null))
      .then((j) => setTargetCount(j?.targets?.length ?? 0)).catch(() => setTargetCount(0));
    fetch("/api/metrics").then((r) => (r.ok ? r.json() : null))
      .then((j) => setMetricMonths(j?.metrics?.length ?? 0)).catch(() => setMetricMonths(0));
  }, []);

  // done === null means "not known yet": the step stays listed rather than
  // claiming either state while its count is in flight.
  const steps: Array<{ key: string; done: boolean | null; href: string; figure?: string; sub?: string }> = [
    {
      key: "complete",
      done: completeness >= 90,
      href: "/dashboard/startup/edit",
      figure: `${completeness}%`,
      sub: nextHint ?? undefined,
    },
    {
      key: "deck",
      done: (startup.documents?.length ?? 0) > 0,
      href: "/dashboard/startup/documents",
    },
    {
      key: "closeDate",
      done: !!startup.round_close_date,
      href: "/dashboard/startup/edit",
    },
    {
      // The recorder is a row inside Round; the step opens it there rather
      // than linking back to the page it already sits on.
      key: "traction",
      done: metricMonths === null ? null : metricMonths >= 2,
      href: tractionHref,
      figure: metricMonths ? String(metricMonths) : undefined,
    },
    {
      key: "targets",
      done: targetCount === null ? null : targetCount >= 5,
      href: "/investors",
      figure: targetCount ? String(targetCount) : undefined,
    },
  ];

  const doneCount = steps.filter((s) => s.done === true).length;
  const open = steps.filter((s) => s.done !== true);
  const signRow = attestation ? 1 : 0;
  // At most five rows. The statement is compliance, so it keeps its place
  // first and the derived steps fill what is left.
  const shown = open.slice(0, 5 - signRow);

  if (shown.length === 0 && !attestation) return null;

  const goHint: ReactNode = (
    <span style={{
      fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
      fontSize: "0.8125rem",
      lineHeight: 1.4,
      color: "var(--cr-ink-3)",
      whiteSpace: "nowrap",
    }}>
      {t("fundraise.go")}
    </span>
  );

  return (
    <Section
      id="next-steps"
      title={tf("dashboard.startup.nextSteps", "Next steps")}
      meta={doneCount > 0 ? tf("dashboard.startup.stepsDone", "{count} done", { count: doneCount }) : null}
    >
      <Ledger columns="minmax(0,1fr) auto auto">
        {attestation && (
          <LedgerRow
            trailing={attestation.onSign ? (
              <button type="button" className="cr-btn cr-btn--text" onClick={attestation.onSign}>
                {t("attest.dashCta")}
              </button>
            ) : undefined}
          >
            <LedgerCell primary>
              <span className="cr-row-title">{t("attest.dashTitle")}</span>
              {/* sd-wrap comes from the founder dashboard, the only page that
                  mounts this: a sentence is not a one-line meta string. */}
              <span className="cr-row-sub sd-wrap">{t("attest.dashBody")}</span>
            </LedgerCell>
            <LedgerCell />
          </LedgerRow>
        )}
        {shown.map((s) => {
          const label = t(`fundraise.step_${s.key}`);
          return (
            <LedgerRow key={s.key} href={s.href} label={label}>
              <LedgerCell primary>
                <span className="cr-row-title">{label}</span>
                {s.sub && <span className="cr-row-sub">{s.sub}</span>}
              </LedgerCell>
              {/* A zero is never a figure: the cell simply stays empty. */}
              <LedgerCell figure>{s.figure ?? null}</LedgerCell>
              <LedgerCell align="end" desktopOnly>{goHint}</LedgerCell>
            </LedgerRow>
          );
        })}
      </Ledger>
    </Section>
  );
}
