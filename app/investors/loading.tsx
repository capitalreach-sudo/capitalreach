import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Investor directory loading state at the page's true geometry: the 56px
 * navbar slot, the 1100px frame, the page header line boxes, the 44px filter
 * bar, the column header and four ledger rows. Every block uses the same
 * LEDGER SYSTEM classes as the live page, and every line box carries the live
 * type metrics, so the rows stream in without a shift. The frame and row
 * markup must stay in step with the loading state in
 * components/investors/investors-client.tsx.
 */

// grid-template-columns of the live ledger (COLUMNS in investors-client.tsx).
const COLUMNS = "minmax(0,1.2fr) minmax(0,1.4fr) auto";
const TITLE_LINE = "calc(0.9375rem * 1.4)";
const SUB_LINE = "calc(0.8125rem * 1.4)";
const FIGURE_LINE = "calc(0.9375rem * 1.55)";
const CAPS_LINE = "calc(0.6875rem * 1.4)";
const ROWS = 4;

function Line({ height, width, bar, end = false }: { height: string; width: string; bar: string; end?: boolean }) {
  return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: end ? "flex-end" : "flex-start" }}>
      <Skeleton w={width} h={bar} />
    </div>
  );
}

export default function InvestorsLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cr-paper)" }} aria-busy="true">
      {/* The sticky navbar is mounted by the page, not the layout. */}
      <div style={{ height: "56px" }} aria-hidden="true" />

      <div className="w-full px-4 pb-16 sm:px-6 md:px-8" style={{ maxWidth: "1100px", marginInline: "auto" }} aria-hidden="true">
        <div className="cr-page-header">
          <div className="cr-page-header__main">
            <Line height="calc(1.75rem * 1.2)" width="7.5rem" bar="1.375rem" />
            <Line height={FIGURE_LINE} width="5.5rem" bar="0.75rem" />
          </div>
        </div>

        <div className="cr-filterbar">
          <div className="cr-filterbar__row">
            <div className="cr-filterbar__search">
              <Skeleton w="100%" h="2.75rem" />
            </div>
            <div className="cr-filterbar__controls">
              <Skeleton w="4.5rem" h="2.75rem" />
              <Skeleton w="6rem" h="2.75rem" />
              <Skeleton w="9rem" h="2.75rem" />
            </div>
            <Skeleton w="5.5rem" h="2.75rem" className="cr-filterbar__sheet-btn" />
          </div>
        </div>

        <div className="cr-ledger" style={{ "--cr-ledger-cols": COLUMNS } as CSSProperties}>
          <div className="cr-colhead">
            <div className="cr-cell"><Line height={CAPS_LINE} width="3.5rem" bar="0.5rem" /></div>
            <div className="cr-cell"><Line height={CAPS_LINE} width="3.5rem" bar="0.5rem" /></div>
            <div className="cr-cell cr-cell--figure"><Line height={CAPS_LINE} width="4.5rem" bar="0.5rem" end /></div>
          </div>
          {Array.from({ length: ROWS }, (_, i) => (
            <div key={i} className="cr-row" style={{ alignItems: "start" }}>
              <div className="cr-cell cr-cell--primary">
                <Line height={TITLE_LINE} width="38%" bar="0.875rem" />
                <Line height={SUB_LINE} width="56%" bar="0.625rem" />
                <Line height={SUB_LINE} width="82%" bar="0.625rem" />
              </div>
              <div className="cr-cell">
                <Line height={SUB_LINE} width="64%" bar="0.625rem" />
              </div>
              <div className="cr-cell cr-cell--figure">
                <Line height={FIGURE_LINE} width="5rem" bar="0.875rem" end />
                <div style={{ height: SUB_LINE }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
