"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { Startup } from "@/types";

/**
 * The fundraising checklist, for founders raising for the first time.
 *
 * Every step is DERIVED from real state, none is a manual checkbox: a
 * checklist you can tick without doing the work is a mood board, and the
 * founder who most needs this is exactly the one who would tick "build a
 * target list" after bookmarking one investor. Ticks here are earned --
 * upload the deck and the deck step ticks itself.
 *
 * Each unfinished step links to the place where it gets done, so the list
 * doubles as navigation for people who do not yet know where things live.
 */
export function FundraiseChecklist({
  startup,
  completeness,
}: {
  startup: Startup;
  completeness: number;
}) {
  const { t } = useTranslation();
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [metricMonths, setMetricMonths] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/targets").then((r) => (r.ok ? r.json() : null))
      .then((j) => setTargetCount(j?.targets?.length ?? 0)).catch(() => setTargetCount(0));
    fetch("/api/metrics").then((r) => (r.ok ? r.json() : null))
      .then((j) => setMetricMonths(j?.metrics?.length ?? 0)).catch(() => setMetricMonths(0));
  }, []);

  const steps: Array<{ key: string; done: boolean | null; href: string; detail?: string }> = [
    {
      key: "complete",
      done: completeness >= 90,
      href: "/dashboard/startup/edit",
      detail: `${completeness}%`,
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
      // null while loading -- render a hollow ring rather than a false "not done".
      key: "traction",
      done: metricMonths === null ? null : metricMonths >= 2,
      href: "/dashboard/startup",
      detail: metricMonths === null ? undefined : t("fundraise.months", { count: metricMonths }),
    },
    {
      key: "targets",
      done: targetCount === null ? null : targetCount >= 5,
      href: "/investors",
      detail: targetCount === null ? undefined : t("fundraise.targets", { count: targetCount }),
    },
    {
      key: "preview",
      // Not trackable, and pretending otherwise would be a lie -- this one is
      // a pointer, permanently unticked, styled as a tip rather than a task.
      done: null,
      href: `/startups/${startup.slug}?preview=investor`,
    },
  ];

  const doneCount = steps.filter((s) => s.done === true).length;
  const measurable = steps.filter((s) => s.key !== "preview").length;

  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <ListChecks style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
          {t("fundraise.title")}
        </h3>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)", marginInlineStart: "auto" }}>
          {doneCount}/{measurable}
        </span>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", lineHeight: 1.6, marginBottom: "12px" }}>
        {t("fundraise.sub")}
      </p>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {steps.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            style={{
              display: "flex", alignItems: "baseline", gap: "10px",
              padding: "8px 2px", textDecoration: "none",
              borderBottom: "1px solid var(--cr-rule)",
            }}
          >
            {s.done === true ? (
              <CheckCircle2 style={{ width: 14, height: 14, color: "var(--cr-up)", flexShrink: 0, alignSelf: "center" }} />
            ) : (
              <Circle style={{ width: 14, height: 14, color: s.key === "preview" ? "var(--cr-copper)" : "var(--cr-paper-4)", flexShrink: 0, alignSelf: "center" }} />
            )}
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: s.done === true ? 300 : 500,
              fontSize: "13px",
              color: s.done === true ? "var(--cr-ink-4)" : "var(--cr-ink)",
              textDecoration: s.done === true ? "line-through" : "none",
              textDecorationColor: "var(--cr-paper-4)",
            }}>
              {t(`fundraise.step_${s.key}`)}
            </span>
            {s.detail && (
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)" }}>{s.detail}</span>
            )}
            {s.done !== true && (
              <span style={{ marginInlineStart: "auto", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-copper)", whiteSpace: "nowrap" }}>
                {s.key === "preview" ? t("fundraise.tip") : t("fundraise.go")} →
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
