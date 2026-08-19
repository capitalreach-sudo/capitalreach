"use client";

import { Fragment, useState } from "react";
import { Check, Minus } from "lucide-react";
import { founderMatrix, investorMatrix, type CellValue, type MatrixRow } from "@/lib/plan-matrix";
import { annualPricing } from "@/lib/plans";
import { InfoTip } from "@/components/shared/info-tip";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Everything each plan includes, side by side.
 *
 * The cards above sell; this answers "what do I actually get". Every cell is
 * generated from the gates the app enforces (lib/plan-matrix), so the table
 * cannot promise something the code would refuse — which is the usual way a
 * pricing page comes to lie.
 *
 * Terms a first-time founder would not know carry an "i".
 */
export function PlanComparison({ side, isLaunch }: { side: "founder" | "investor"; isLaunch: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { plans, rows } = side === "founder" ? founderMatrix() : investorMatrix();

  const groups = rows.reduce<Record<string, MatrixRow[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  const cell = (v: CellValue) => {
    if (v === true) return <Check style={{ width: 14, height: 14, color: "var(--cr-up)" }} aria-label={t("common.yes")} />;
    if (v === false || v === 0) return <Minus style={{ width: 12, height: 12, color: "var(--cr-ink-4)" }} aria-label={t("common.no")} />;
    if (v === "unlimited") return <span style={figure}>{t("compare.unlimited")}</span>;
    if (v === "payPerReport") return <span style={{ ...figure, color: "var(--cr-copper)" }}>{t("compare.payPerReport")}</span>;
    return <span style={figure}>{String(v)}</span>;
  };

  return (
    <section style={{ marginTop: "40px" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)" }}>
        {open ? t("compare.hide") : t("compare.show")}
      </button>

      {open && (
        <div style={{ overflowX: "auto", marginTop: "16px", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: `${220 + plans.length * 110}px` }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", minWidth: "200px" }}>{t("compare.feature")}</th>
                {plans.map(p => {
                  const yearly = annualPricing(p);
                  return (
                    <th key={p.id} style={th}>
                      <span style={{ display: "block", color: "var(--cr-ink)", fontSize: "12px", fontWeight: 700 }}>{p.name}</span>
                      <span style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", marginTop: "2px", fontWeight: 400 }}>
                        {isLaunch || p.price === 0 ? t("pricing.free") : `$${p.price}${t("pricing.perMonth")}`}
                      </span>
                      {!isLaunch && yearly && (
                        <span style={{ display: "block", fontSize: "9px", color: "var(--cr-copper)", marginTop: "1px", fontWeight: 600 }}>
                          {t("compare.orYearly", { total: yearly.total, percent: yearly.percentOff })}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([group, groupRows]) => (
                <Fragment key={group}>
                  <tr>
                    <td colSpan={plans.length + 1}
                      style={{ padding: "12px 12px 6px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                        fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.14em",
                        color: "var(--cr-ink-4)", background: "var(--cr-paper-2)" }}>
                      {t(`compare.group.${group}`)}
                    </td>
                  </tr>
                  {groupRows.map(r => (
                    <tr key={r.key}>
                      <td style={{ ...td, textAlign: "left", color: "var(--cr-ink-2)" }}>
                        {t(r.labelKey)}
                        {r.infoKey && <InfoTip termKey={r.infoKey} />}
                      </td>
                      {r.values.map((v, i) => (
                        <td key={plans[i].id} style={{ ...td, textAlign: "center" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{cell(v)}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const th: React.CSSProperties = {
  padding: "12px 10px", textAlign: "center",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px",
  color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em",
  borderBottom: "1px solid var(--cr-rule-dark)", verticalAlign: "bottom",
};

const td: React.CSSProperties = {
  padding: "9px 10px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
  fontSize: "12.5px", color: "var(--cr-ink-3)", borderTop: "1px solid var(--cr-rule)",
};

const figure: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px", color: "var(--cr-ink)",
};
