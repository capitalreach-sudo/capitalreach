"use client";

import type { FunnelStep } from "@/lib/funnel";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * E56. Read top to bottom: the bar is each step as a share of the top of the
 * funnel, and the number beside it is the share of the step immediately
 * above -- which is the one that tells you where to spend a week.
 *
 * The biggest drop is called out, because the point of a funnel is to have an
 * opinion about which step is the problem.
 */
export function AdminFunnel({ steps }: { steps: FunnelStep[] }) {
  const { t } = useTranslation();
  if (!steps.length || steps[0].count === 0) return null;

  // The worst conversion between two consecutive non-empty steps.
  let worst: FunnelStep | null = null;
  for (const s of steps.slice(1)) {
    if (s.fromPrev == null) continue;
    if (!worst || s.fromPrev < (worst.fromPrev ?? 100)) worst = s;
  }

  return (
    <section className="border border-cr-p4 rounded-xl p-5 mb-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h2 className="ruled-label">{t("funnel.title")}</h2>
        {worst && worst.fromPrev != null && (
          <span className="text-[11px] text-cr-i4">
            {t("funnel.biggestDrop", { step: t(`funnel.step.${worst.key}`), pct: worst.fromPrev })}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {steps.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span className="text-xs text-cr-i3 w-40 shrink-0">{t(`funnel.step.${s.key}`)}</span>
            <div className="flex-1 bg-cr-p3 rounded-full h-2.5 overflow-hidden min-w-[60px]">
              <div
                className={`h-full rounded-full ${s.key === worst?.key ? "bg-cr-ink" : "bg-cr-copper"}`}
                style={{ width: `${Math.max(s.fromTop ?? 100, s.count > 0 ? 1.5 : 0)}%` }}
              />
            </div>
            <span className="text-xs font-mono text-cr-ink w-10 text-right shrink-0">{s.count}</span>
            <span className="font-mono text-[11px] text-cr-i4 w-14 text-right shrink-0">
              {s.fromPrev == null ? "" : `${s.fromPrev}%`}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-cr-i4 mt-3">{t("funnel.legend")}</p>
    </section>
  );
}
