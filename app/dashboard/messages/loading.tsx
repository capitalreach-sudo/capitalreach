import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Messages loading state.
 *
 * The static chrome renders immediately at the inbox's TRUE geometry -- the
 * 56px navbar strip, the copper ruled bar, the serif h1 line box, and the
 * 620px two-pane frame with its 300px sidebar. Squares are 3-4px like the
 * live surface (avatars, bubbles, inputs); nothing here is a circle or a
 * 16px template corner. Only the data is suppressed: quiet paper-3 blocks
 * hold the place of text, real paper-4 frames hold the avatar slots, and a
 * mono dash holds the place of every timestamp, which is exactly how the
 * live page writes absence. No copper fills -- a dead surface has no
 * primary action.
 */

// A plausible thread list, not four identical gray towers.
const THREADS: { name: number; sub: number }[] = [
  { name: 128, sub: 72 },
  { name: 96,  sub: 88 },
  { name: 144, sub: 64 },
  { name: 104, sub: 80 },
];

// A plausible conversation: alternating sides, varied line counts.
const BUBBLES: { own: boolean; w: number; h: number }[] = [
  { own: false, w: 232, h: 64 },
  { own: true,  w: 200, h: 48 },
  { own: false, w: 256, h: 80 },
  { own: true,  w: 216, h: 64 },
  { own: false, w: 184, h: 48 },
];

const monoDash: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 300,
  fontSize: "10px",
  color: "var(--cr-ink-4)",
};

// The avatar slot is real chrome, not a pulse: the live list draws the same
// paper-4 square behind its initials.
const avatarFrame = (size: number, radius: string): React.CSSProperties => ({
  width: size, height: size, borderRadius: radius,
  background: "var(--cr-paper-4)", border: "1px solid var(--cr-rule)",
  flexShrink: 0,
});

export default function MessagesLoading() {
  return (
    <div className="min-h-screen" style={{ background: "var(--cr-paper)" }} aria-busy="true">
      {/* Navbar stand-in at the navbar's true 56px, hairline below. */}
      <div style={{ height: "56px", borderBottom: "1px solid var(--cr-rule)", background: "var(--cr-paper)" }} />

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 40px 60px" }}>

        {/* Page header at the live header's metrics. */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            {/* Ruled label: the copper bar is real chrome and renders at
                once; the label text is locale data, so a slug holds its slot. */}
            <div className="ruled-label" style={{ marginBottom: "10px" }}>
              <Skeleton w="56px" h="11px" />
            </div>
            {/* The h1 line box at the real serif metrics (clamp 24-32px), so
                nothing shifts when the title streams in. */}
            <div style={{ height: "clamp(30px, 3.7vw, 40px)", display: "flex", alignItems: "center" }}>
              <Skeleton w="min(200px, 60vw)" h="clamp(24px, 3vw, 32px)" />
            </div>
            <div style={{ height: "20px", display: "flex", alignItems: "center", marginTop: "4px" }}>
              <Skeleton w="132px" h="11px" />
            </div>
          </div>
          {/* Primary-action slot, suppressed: no copper until it can be pressed. */}
          <Skeleton w="140px" h="36px" />
        </div>

        {/* The two-pane frame at its true 620px height, 4px corners. */}
        <div style={{ display: "flex", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden", height: "620px" }}>

          {/* Sidebar: full width at 375, the live 300px from md up. */}
          <div className="w-full md:w-[300px] shrink-0" style={{ display: "flex", flexDirection: "column", background: "var(--cr-paper-2)" }}>
            {/* Search block: archive-toggle slug, then the input's real frame. */}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--cr-rule)" }}>
              <div style={{ marginBottom: "8px" }}>
                <Skeleton w="112px" h="26px" />
              </div>
              <div style={{ height: "34px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px" }} />
            </div>

            {/* Status filter pills at their real 3px-radius heights. */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--cr-rule)", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[34, 52, 92, 62].map((w, i) => (
                <Skeleton key={i} w={`${w}px`} h="23px" />
              ))}
            </div>

            {/* Thread rows: paper-4 avatar squares, slugs for names, a mono
                dash where the live row prints its time-ago. */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              {THREADS.map((row, i) => (
                <div key={i} style={{ padding: "14px 16px", borderBottom: "1px solid var(--cr-rule)", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={avatarFrame(36, "4px")} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                      <Skeleton w={`min(${row.name}px, 70%)`} h="12px" />
                      <span style={monoDash} aria-hidden>{"—"}</span>
                    </div>
                    <div style={{ marginTop: "7px" }}>
                      <Skeleton w={`min(${row.sub}px, 50%)`} h="9px" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat pane: hidden at 375 exactly like the live page's first paint. */}
          <div className="hidden md:flex" style={{ flex: 1, flexDirection: "column", minWidth: 0, borderLeft: "1px solid var(--cr-rule-dark)" }}>
            {/* Chat header. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={avatarFrame(32, "3px")} />
                <div>
                  <Skeleton w="120px" h="12px" />
                  <div style={{ marginTop: "6px" }}>
                    <Skeleton w="72px" h="9px" />
                  </div>
                </div>
              </div>
              {/* Star / archive slots at their real 30px squares. */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <Skeleton w="30px" h="30px" />
                <Skeleton w="30px" h="30px" />
              </div>
            </div>

            {/* In-thread search strip. */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "11px 20px", borderBottom: "1px solid var(--cr-rule)", background: "var(--cr-paper)" }}>
              <Skeleton w="12px" h="12px" />
              <Skeleton w="140px" h="10px" />
            </div>

            {/* Messages area: the date chip, then quiet bubbles at the live
                4px radius. Own-side bubbles suppress to paper-3 -- copper is
                for messages that exist. */}
            <div style={{ flex: 1, overflow: "hidden", padding: "20px", display: "flex", flexDirection: "column", gap: "8px", background: "var(--cr-paper)" }}>
              <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                <Skeleton w="104px" h="20px" />
              </div>
              {BUBBLES.map((b, i) => (
                <div key={i} style={{ display: "flex", justifyContent: b.own ? "flex-end" : "flex-start" }}>
                  {b.own ? (
                    <Skeleton w={`min(${b.w}px, 70%)`} h={`${b.h}px`} />
                  ) : (
                    <div style={{ width: `min(${b.w}px, 70%)`, height: `${b.h}px`, background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px" }} />
                  )}
                </div>
              ))}
            </div>

            {/* Compose row: templates, attach, the textarea's real frame, and
                a quiet send slot -- 38px squares, no copper. */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)", display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
              <Skeleton w="80px" h="38px" />
              <Skeleton w="38px" h="38px" />
              <div style={{ flex: 1, height: "38px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px" }} />
              <Skeleton w="38px" h="38px" />
            </div>
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 12px 8px", background: "var(--cr-paper-2)" }}>
              <Skeleton w="192px" h="9px" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
