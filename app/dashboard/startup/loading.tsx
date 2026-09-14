import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Founder dashboard loading state.
 *
 * The chrome the dashboard actually draws renders at once: the container
 * geometry, the hairline under the stage row, the dark rule under each
 * section head, and the row hairlines at their true 3.5rem pitch. Only the
 * words are suppressed, so nothing moves when the data lands.
 *
 * Geometry is shared with components/dashboard/startup-dashboard-client.tsx
 * and the LEDGER SYSTEM block in app/globals.css: page header 2rem top and
 * 1.5rem below, stage row 3rem below, 3rem between sections, 0.75rem from a
 * section head to its first row.
 */

const CONTAINER: React.CSSProperties = {
  maxWidth: "68.75rem",
  marginInline: "auto",
  paddingInline: "clamp(1rem, 4vw, 2rem)",
  paddingBlockEnd: "4rem",
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1.5rem",
  minHeight: "3.5rem",
  paddingBlock: "1rem",
  borderBlockEnd: "1px solid var(--cr-rule)",
};

// Slug widths vary the way real locale strings do, rather than making an
// identical grey tower.
const ROWS: Array<[string, string]> = [
  ["min(17rem, 62vw)", "3rem"],
  ["min(13rem, 52vw)", "2.5rem"],
  ["min(15rem, 58vw)", "3.5rem"],
];

function SectionBlock({ titleWidth }: { titleWidth: string }) {
  return (
    <section style={{ marginBlockStart: "3rem" }}>
      <div style={{ paddingBlockEnd: "0.75rem", borderBlockEnd: "1px solid var(--cr-rule-dark)" }}>
        {/* h2 line box at 1.125rem/1.3 so the heading does not shift in. */}
        <div style={{ height: "1.4625rem", display: "flex", alignItems: "center" }}>
          <Skeleton w={titleWidth} h="0.875rem" />
        </div>
      </div>
      {ROWS.map(([label, figure], i) => (
        <div key={i} style={ROW}>
          <Skeleton w={label} h="0.875rem" />
          <Skeleton w={figure} h="0.875rem" />
        </div>
      ))}
    </section>
  );
}

export default function Loading() {
  return (
    <main style={{ backgroundColor: "var(--cr-paper)", minHeight: "100vh" }} aria-busy="true">
      <div style={CONTAINER}>

        {/* Page header: h1 line box at 1.75rem/1.2, the status chip beside it,
            and the two header action frames at their real 2.75rem height. */}
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
          columnGap: "1.5rem", rowGap: "0.75rem",
          paddingBlockStart: "2rem", marginBlockEnd: "1.5rem",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", flex: "1 1 18rem", minWidth: 0 }}>
            <div style={{ height: "2.1rem", display: "flex", alignItems: "center" }}>
              <Skeleton w="min(16rem, 70vw)" h="1.5rem" />
            </div>
            <Skeleton w="4.5rem" h="1.25rem" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <Skeleton w="7rem" h="2.75rem" />
            <Skeleton w="9rem" h="2.75rem" />
          </div>
        </div>

        {/* Stage row: the four steps on one hairline row, the next action at
            the inline end. */}
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
          columnGap: "1.5rem", rowGap: "0.75rem",
          minHeight: "3.5rem", paddingBlock: "0.75rem", marginBlockEnd: "3rem",
          borderBlockEnd: "1px solid var(--cr-rule)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {["3rem", "4.5rem", "2.5rem", "5rem"].map((w, i) => (
              <Skeleton key={i} w={w} h="0.8125rem" />
            ))}
          </div>
          <Skeleton w="10rem" h="2.75rem" />
        </div>

        <SectionBlock titleWidth="min(7rem, 40vw)" />
        <SectionBlock titleWidth="min(6rem, 36vw)" />
      </div>
    </main>
  );
}
