import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Investor dashboard loading state.
 *
 * The static chrome renders immediately at the dashboard's TRUE geometry --
 * the copper ruled bar, the serif h1 line box, the header action frames, the
 * four stat-cell frames, and the tab bar with its copper active underline.
 * Only the data is suppressed: quiet paper-3 slugs hold the place of text,
 * and a mono dash holds the place of every number, which is exactly how the
 * live dashboard writes absence.
 */

// Label slugs vary in width the way real locale strings do -- four stat
// labels, four tab labels, three header actions. Not identical gray towers.
const STAT_LABEL_WIDTHS = [64, 76, 80, 60];
const TAB_WIDTHS = [64, 60, 68, 44];
const ACTION_WIDTHS = [72, 56, 64];

// The watchlist grid previews a plausible shelf of saved companies, not six
// identical gray towers: card heights vary the way real listings do.
const CARD_HEIGHTS = [232, 248, 220, 240, 228, 244];

const monoDash: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 700,
  fontSize: "26px",
  color: "var(--cr-ink-4)",
};

export default function Loading() {
  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }} aria-busy="true">

      {/* Header band: real hairline, real paddings. The ruled label's copper
          bar is chrome and renders at once; label and name are data, so quiet
          slugs hold their slots at the true serif metrics. */}
      <div style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 40px 32px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div className="ruled-label" style={{ marginBottom: "10px" }}>
              <Skeleton w="120px" h="11px" />
            </div>
            {/* h1 line box at clamp(28-36px) serif metrics, so nothing
                shifts when the investor's name streams in. */}
            <div style={{ height: "clamp(34px, 4.8vw, 43px)", display: "flex", alignItems: "center", marginBottom: "6px" }}>
              <Skeleton w="min(240px, 65vw)" h="clamp(28px, 4vw, 36px)" />
            </div>
            {/* Membership line at 14px body metrics. */}
            <div style={{ height: "20px", display: "flex", alignItems: "center" }}>
              <Skeleton w="128px" h="13px" />
            </div>
          </div>
          {/* Three quiet action frames at the live outline-button geometry;
              their labels are locale data, so slugs sit inside real frames. */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {ACTION_WIDTHS.map((w, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)", borderRadius: "4px", padding: "7px 14px" }}>
                <span style={{ height: "17px", display: "flex", alignItems: "center" }}>
                  <Skeleton w={`${w}px`} h="11px" />
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 40px 64px" }}>

        {/* Four stat cells: real frames, suppressed contents. The dash is
            the dashboard's own glyph for a number that is not here yet. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "32px" }}>
          {STAT_LABEL_WIDTHS.map((w, i) => (
            <div key={i} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px 18px" }}>
              <div style={{ height: "13px", display: "flex", alignItems: "center", marginBottom: "10px" }}>
                <Skeleton w={`${w}px`} h="9px" />
              </div>
              <p style={monoDash}>{"—"}</p>
            </div>
          ))}
        </div>

        {/* Tab bar: the hairline and the copper underline of the default tab
            are real chrome; the four labels are locale data. */}
        <div style={{ borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: "28px", display: "flex", overflowX: "hidden" }}>
          {TAB_WIDTHS.map((w, i) => (
            <div key={i} style={{ padding: "10px 18px 9px", borderBottom: i === 0 ? "2px solid var(--cr-copper)" : "2px solid transparent" }}>
              <span style={{ height: "17px", display: "flex", alignItems: "center" }}>
                <Skeleton w={`${w}px`} h="11px" />
              </span>
            </div>
          ))}
        </div>

        {/* Watchlist region: one full-width activity block above the saved
            count line, then the card grid at its true 260px column floor. */}
        <Skeleton h="120px" className="mb-6" />
        <div style={{ height: "20px", display: "flex", alignItems: "center", marginBottom: "16px" }}>
          <Skeleton w="104px" h="13px" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" }}>
          {CARD_HEIGHTS.map((h, i) => (
            <Skeleton key={i} h={`${h}px`} />
          ))}
        </div>
      </div>
    </main>
  );
}
