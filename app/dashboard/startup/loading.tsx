import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Startup dashboard loading state.
 *
 * The static chrome renders immediately at the dashboard's TRUE geometry --
 * the copper ruled bar, the serif h1 line box, the header action frames, the
 * four stat-cell frames, and the tab bar with its copper active underline.
 * Only the data is suppressed: quiet paper-3 slugs hold the place of text,
 * and a mono dash holds the place of every number, which is exactly how the
 * live dashboard writes absence.
 */

// Label slugs vary in width the way real locale strings do -- four stat
// labels, four tab labels, four header actions. Not identical gray towers.
const STAT_LABEL_WIDTHS = [72, 84, 64, 52];
const TAB_WIDTHS = [56, 68, 72, 44];
const ACTION_WIDTHS = [80, 96, 76, 72];

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
              <Skeleton w="112px" h="11px" />
            </div>
            {/* h1 line box at clamp(26-34px) serif metrics, so nothing
                shifts when the company name streams in. */}
            <div style={{ height: "clamp(32px, 4.8vw, 41px)", display: "flex", alignItems: "center", marginBottom: "10px" }}>
              <Skeleton w="min(260px, 70vw)" h="clamp(26px, 4vw, 34px)" />
            </div>
            {/* Status badge + tier line. */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Skeleton w="72px" h="22px" />
              <Skeleton w="88px" h="13px" />
            </div>
          </div>
          {/* Four quiet action frames at the live outline-button geometry;
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

        {/* Overview region at the true third/two-thirds split: the profile
            completion card on the left, the working cards stacked right. */}
        <div className="grid-third-stack">
          <Skeleton h="320px" />
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Skeleton h="152px" />
            <Skeleton h="152px" />
          </div>
        </div>
      </div>
    </main>
  );
}
