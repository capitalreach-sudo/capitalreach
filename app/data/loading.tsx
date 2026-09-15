import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Data Centre loading state.
 *
 * Static chrome at the page's TRUE geometry -- the 64px navbar slot, the
 * dark masthead band with its ruled label, serif h1 line box and colophon
 * rule, then the totals chapter: the lead figure under its 2px ink rule and
 * the three supporting totals on their hairlines. Tokens only: the old
 * skeleton painted the rejected navy design's #0e0b30 band, and its header
 * bar matched the page ground exactly -- a skeleton nobody could see.
 */

// Band bars derive from the band's own ink, not the paper tokens: a paper-3
// block on the dark slab reads as content arriving rather than as quiet.
const bandBar = (w: string, h: string): React.CSSProperties => ({
  width: w, height: h, borderRadius: "4px",
  background: "color-mix(in srgb, var(--cr-band-ink) 12%, transparent)",
});

export default function DataLoading() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: "var(--cr-paper)" }} aria-busy="true">
      {/* The sticky navbar is mounted by the page, not the layout; hold its
          64px so the band sits exactly where it will land. */}
      <div style={{ height: "64px", borderBottom: "1px solid var(--cr-rule)" }} aria-hidden />

      {/* Masthead band at the live band's tokens and insets. */}
      <div style={{ background: "var(--cr-band-bg)", borderBottom: "1px solid var(--cr-copper-br)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "clamp(48px, 6vw, 64px) clamp(24px, 5vw, 32px)" }}>
          <div style={{ ...bandBar("72px", "11px"), marginBottom: "16px" }} />
          {/* The h1 line box at its real clamp, so the title streams in
              without a shift. */}
          <div style={{ height: "clamp(30px, 4.5vw, 44px)", display: "flex", alignItems: "center", marginBottom: "16px" }}>
            <div style={bandBar("min(320px, 70%)", "clamp(24px, 3.6vw, 36px)")} />
          </div>
          <div style={bandBar("min(360px, 85%)", "12px")} />
          {/* Colophon rule and its meta line. */}
          <div style={{ marginTop: "32px", paddingTop: "16px", borderTop: "1px solid color-mix(in srgb, var(--cr-band-ink) 18%, transparent)" }}>
            <div style={bandBar("200px", "11px")} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "clamp(48px, 6vw, 64px) clamp(24px, 5vw, 32px) 96px" }}>
        {/* Totals chapter: ruled label, then the lead figure under its heavy
            ink rule -- the same double weight the live page opens on. */}
        <div className="ruled-label" style={{ marginBottom: "32px" }}>
          <Skeleton w="96px" h="11px" />
        </div>
        <div style={{ borderTop: "2px solid var(--cr-ink)", paddingTop: "24px" }}>
          <Skeleton w="120px" h="10px" className="mb-2" />
          <div style={{ height: "clamp(40px, 5vw + 16px, 64px)", display: "flex", alignItems: "center" }}>
            <Skeleton w="min(280px, 60%)" h="clamp(32px, 4vw + 12px, 52px)" />
          </div>
        </div>
        {/* Three supporting totals on their hairlines. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "32px 48px", marginTop: "32px" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ flex: "1 1 170px", borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "12px" }}>
              <Skeleton w="80px" h="10px" className="mb-2" />
              <Skeleton w="72px" h="24px" />
            </div>
          ))}
        </div>
        {/* The chart chapter's frame at the chart's real height. */}
        <div style={{ marginTop: "clamp(48px, 6vw, 64px)" }}>
          <div className="ruled-label" style={{ marginBottom: "16px" }}>
            <Skeleton w="88px" h="11px" />
          </div>
          <Skeleton h="200px" />
        </div>
      </div>
    </div>
  );
}
