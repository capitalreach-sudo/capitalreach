"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
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
 * Inline-styled hairline rows to match the founder dashboard it mounts in
 * (components/dashboard/startup-dashboard-client.tsx), the same house idiom
 * as WatchlistChanges -- this used to render through Ledger/Section, the
 * Apple Design component system the dashboard itself was reverted away from.
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

  const titleStyle: React.CSSProperties = {
    fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)",
  };
  const subStyle: React.CSSProperties = {
    display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px",
  };

  return (
    <section id="next-steps" style={{ borderTop: "1px solid var(--cr-rule)", paddingTop: "24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <h3 className="ruled-label" data-cr-visible="1">{tf("dashboard.startup.nextSteps", "Next steps")}</h3>
        {doneCount > 0 && (
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
            {tf("dashboard.startup.stepsDone", "{count} done", { count: doneCount })}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {attestation && (
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "12px 0", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <span style={titleStyle}>{t("attest.dashTitle")}</span>
              <span style={subStyle}>{t("attest.dashBody")}</span>
            </div>
            {attestation.onSign && (
              <button type="button" className="cr-btn cr-btn--text" onClick={attestation.onSign} style={{ flexShrink: 0 }}>
                {t("attest.dashCta")}
              </button>
            )}
          </div>
        )}
        {shown.map((s, i) => {
          const label = t(`fundraise.step_${s.key}`);
          return (
            <Link
              key={s.key}
              href={s.href}
              style={{
                display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px",
                padding: "12px 0", borderTop: (attestation || i > 0) ? "1px solid var(--cr-rule)" : "none",
                textDecoration: "none", flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={titleStyle}>{label}</span>
                {s.sub && <span style={subStyle}>{s.sub}</span>}
              </div>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: "12px", flexShrink: 0 }}>
                {/* A zero is never a figure: nothing renders instead. */}
                {s.figure && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink-2)", fontVariantNumeric: "tabular-nums" }}>
                    {s.figure}
                  </span>
                )}
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-3)", whiteSpace: "nowrap" }}>
                  {t("fundraise.go")}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
