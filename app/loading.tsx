import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Homepage loading state.
 *
 * The hero's static chrome renders immediately at the page's TRUE geometry --
 * the 56px navbar slot, the full-viewport centered column with its glow and
 * grain, the copper ruled-label opener, the two serif display line boxes at
 * their real clamp metrics, and the CTA pill pair. Only locale text is
 * suppressed: quiet paper-3 blocks hold each slot so nothing shifts when the
 * page streams in. The hero fills the first viewport, so nothing below the
 * fold needs a stand-in.
 */
export default function HomeLoading() {
  return (
    <div className="min-h-screen" style={{ background: "var(--cr-paper)" }} aria-busy="true">
      {/* The sticky navbar is mounted by the page, not the layout; hold its
          56px so the hero sits exactly where it will land. */}
      <div style={{ height: "56px" }} aria-hidden />

      <section
        className="min-h-[calc(100svh-56px)] flex items-center"
        style={{ background: "var(--cr-paper)", position: "relative", overflow: "hidden" }}
      >
        <div className="hero-glow" aria-hidden />
        <div className="hero-noise" aria-hidden />

        <div
          className="max-w-[1040px] mx-auto w-full px-6 md:px-10 py-16 md:py-0 flex flex-col items-center text-center"
          style={{ position: "relative", zIndex: 1 }}
        >
          {/* Ruled label: the copper bar is real chrome and renders at once;
              the eyebrow text is locale data, so a quiet slug holds its slot. */}
          <div className="ruled-label" style={{ marginBottom: "40px", justifyContent: "center" }}>
            <Skeleton w="128px" h="11px" />
          </div>

          {/* Two display lines at the real serif metrics (clamp 38-78px at
              1.02 line height), the second one shorter -- the shape of a
              headline, not a stack of equal bars. */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "100%", marginBottom: "28px" }}>
            <Skeleton w="min(560px, 92%)" h="clamp(34px, 6vw, 70px)" />
            <Skeleton w="min(440px, 72%)" h="clamp(34px, 6vw, 70px)" />
          </div>

          {/* One-liner at its 17px/1.7 line box, max-width 520px. */}
          <div style={{ height: "29px", display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
            <Skeleton w="min(460px, 86%)" h="13px" />
          </div>

          {/* CTA pair at true pill geometry: the primary slot is a quiet
              block (no copper until there is a button to press), the
              secondary is its real hairline frame with the label suppressed. */}
          <div className="flex flex-col sm:flex-row items-center justify-center w-full sm:w-auto" style={{ gap: "12px", marginTop: "36px" }}>
            <div
              className="animate-pulse w-full sm:w-44"
              style={{ height: "46px", background: "var(--cr-paper-3)", borderRadius: "999px" }}
            />
            <div
              className="w-full sm:w-44"
              style={{ height: "46px", border: "1px solid var(--cr-paper-4)", borderRadius: "999px", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Skeleton w="88px" h="11px" />
            </div>
          </div>

          {/* Trust row line box (12px type at 28px top). */}
          <div style={{ height: "18px", display: "flex", alignItems: "center", marginTop: "28px" }}>
            <Skeleton w="min(300px, 80%)" h="10px" />
          </div>
        </div>
      </section>
    </div>
  );
}
