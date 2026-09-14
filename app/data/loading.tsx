import { Skeleton } from "@/components/ui/Skeleton";
import { DataCentreSkeleton } from "@/components/shared/data-centre";

/**
 * Data Centre loading state at the loaded page's geometry: the 56px navbar
 * slot, the page header, then the report body (lead, strip, four ledger
 * rows) from the same component the client retry path renders. The frame
 * values mirror data-centre.tsx; a client module cannot export them here.
 */
export default function DataLoading() {
  return (
    <div style={{ background: "var(--cr-paper)" }}>
      {/* The navbar is mounted by the page, not the layout. */}
      <div style={{ height: "56px", borderBottom: "1px solid var(--cr-rule)" }} aria-hidden="true" />
      <div style={{ maxWidth: "68.75rem", marginInline: "auto", paddingInline: "clamp(1.5rem, 5vw, 2rem)", paddingBlockEnd: "4rem" }}>
        <div className="cr-page-header" aria-hidden="true">
          <div className="cr-page-header__main">
            <div style={{ height: "2.1rem", display: "flex", alignItems: "center" }}>
              <Skeleton w="10rem" h="1.5rem" />
            </div>
          </div>
          <div className="cr-page-header__end">
            <Skeleton w="7rem" h="0.8125rem" />
          </div>
        </div>
        <DataCentreSkeleton />
      </div>
    </div>
  );
}
