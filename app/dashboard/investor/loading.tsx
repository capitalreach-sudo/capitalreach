import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Investor dashboard loading state, at the geometry of the page it becomes:
 * the page header, the "Waiting on you" section with one row, then the
 * "Watchlist" section with its column head and four rows. It reuses the
 * ledger classes from app/globals.css, so row heights, rules and insets are
 * the live ones. The container values match .crd-page in
 * components/dashboard/investor-dashboard-client.tsx.
 */

const line = (height: string): CSSProperties => ({ height, display: "flex", alignItems: "center" });

// Name slugs vary the way real company names do.
const NAME_WIDTHS = ["11rem", "8.5rem", "13rem", "9.5rem"];
const META_WIDTHS = ["7rem", "9rem", "6rem", "8rem"];

function RowText({ name, meta }: { name: string; meta: string }) {
  return (
    <div className="cr-cell cr-cell--primary">
      {/* 15px title and 13px sub line boxes at their live leading. */}
      <div style={line("1.3125rem")}><Skeleton w={`min(${name}, 60%)`} h="0.9375rem" /></div>
      <div style={line("1.1375rem")}><Skeleton w={`min(${meta}, 40%)`} h="0.8125rem" /></div>
    </div>
  );
}

export default function Loading() {
  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }} aria-busy="true">
      <div style={{ maxWidth: "1100px", marginInline: "auto", paddingInline: "clamp(1rem, 4vw, 2rem)", paddingBlockEnd: "4rem" }}>
        <div className="cr-page-header">
          <div className="cr-page-header__main">
            {/* 28px H1 at 1.2 leading. */}
            <div style={line("2.1rem")}><Skeleton w="min(15rem, 60vw)" h="1.75rem" /></div>
            <div style={line("1.453rem")}><Skeleton w="5rem" h="0.9375rem" /></div>
          </div>
        </div>

        <section className="cr-section">
          <div className="cr-section-head">
            <div style={line("1.4625rem")}><Skeleton w="8rem" h="1.125rem" /></div>
          </div>
          <ul className="cr-ledger" role="list">
            <li className="cr-row">
              <RowText name={NAME_WIDTHS[0]} meta={META_WIDTHS[1]} />
            </li>
          </ul>
        </section>

        <section className="cr-section">
          <div className="cr-section-head">
            <div style={line("1.4625rem")}><Skeleton w="6rem" h="1.125rem" /></div>
          </div>
          <div className="cr-ledger" data-head="" style={{ "--cr-ledger-cols": "minmax(0,1fr) auto auto" } as CSSProperties}>
            <div className="cr-colhead">
              <div className="cr-cell"><Skeleton w="4rem" h="0.6875rem" /></div>
              <div className="cr-cell cr-cell--figure"><Skeleton w="3.5rem" h="0.6875rem" /></div>
              <div className="cr-cell cr-cell--end"><Skeleton w="3rem" h="0.6875rem" /></div>
            </div>
            {NAME_WIDTHS.map((w, i) => (
              <div key={i} className="cr-row">
                <RowText name={w} meta={META_WIDTHS[i]} />
                <div className="cr-cell cr-cell--figure"><Skeleton w="4rem" h="0.9375rem" /></div>
                {/* The 44px status select and note toggle. */}
                <div className="cr-cell cr-cell--end"><Skeleton w="12rem" h="2.75rem" /></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
