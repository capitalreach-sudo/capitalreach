import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Deal portal loading state.
 *
 * The static chrome renders immediately at the board's TRUE geometry -- the
 * copper ruled bar, the serif h1 line box, the five stat-cell frames, and the
 * column lane (proposals column plus the five stage columns, each at their
 * real 264px width). Only the data is suppressed: quiet paper-3 blocks hold
 * the place of text, and a mono dash holds the place of every number, which
 * is exactly how the live board writes absence.
 */

// The lane previews a plausible board, not six identical gray towers: badge
// widths and card stacks vary per column the way a real pipeline does.
const COLUMNS: { badge: number; cards: number[] }[] = [
  { badge: 84, cards: [112] },            // proposals
  { badge: 64, cards: [104, 88, 96] },    // intro
  { badge: 92, cards: [96, 112] },        // negotiation
  { badge: 88, cards: [120, 88] },        // term sheet
  { badge: 68, cards: [96] },             // closed
  { badge: 60, cards: [88] },             // passed
];

const STAT_LABEL_WIDTHS = [88, 64, 56, 72, 60];

const monoDash: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 600,
  fontSize: "15px",
  color: "var(--cr-ink-4)",
};

export default function DealsLoading() {
  return (
    <div className="min-h-screen" style={{ background: "var(--cr-paper)" }} aria-busy="true">
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 24px 64px" }}>
        {/* Ruled label: the copper bar is real chrome and renders at once;
            the label text is locale data, so a quiet slug holds its slot. */}
        <div className="ruled-label" style={{ marginBottom: "16px" }}>
          <Skeleton w="96px" h="11px" />
        </div>

        {/* The h1 line box at the real serif metrics (clamp 28-44px at 1.5
            line height), so nothing shifts when the title streams in. */}
        <div style={{ height: "clamp(42px, 6vw, 66px)", display: "flex", alignItems: "center", marginBottom: "32px" }}>
          <Skeleton w="min(340px, 75%)" h="clamp(28px, 4vw, 44px)" />
        </div>

        {/* Five stat cells: real frames, suppressed contents. The dash is the
            board's own glyph for a number that is not here yet. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: "10px", marginBottom: "16px" }}>
          {STAT_LABEL_WIDTHS.map((w, i) => (
            <div key={i} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px 16px" }}>
              <div style={{ height: "15px", display: "flex", alignItems: "center" }}>
                <Skeleton w={`${w}px`} h="9px" />
              </div>
              <p style={monoDash}>{"—"}</p>
            </div>
          ))}
        </div>

        {/* The column lane at true widths: proposals plus the five stages.
            Overflow is clipped, not scrollable -- a dead surface should not
            invite interaction, and the page itself never scrolls sideways. */}
        <div style={{ overflowX: "hidden" }}>
          <div style={{ display: "flex", gap: "14px", minWidth: "max-content", paddingBottom: "8px" }}>
            {COLUMNS.map((col, i) => (
              <div key={i} style={{ width: "264px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <Skeleton w={`${col.badge}px`} h="20px" />
                  <span style={{ ...monoDash, fontWeight: 300, fontSize: "11px" }} aria-hidden>{"—"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {col.cards.map((h, j) => (
                    <Skeleton key={j} h={`${h}px`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
