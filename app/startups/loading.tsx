import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Startup directory loading state.
 *
 * Static chrome at the directory's TRUE geometry -- the 56px navbar slot, the
 * ruled-label + serif h1 header block, the filter-bar frame, and the card
 * grid at its real minmax(280px) columns. The card internals mirror the
 * client's own SkeletonCard exactly, so the route-level frame hands off to
 * the in-page loader without a pixel of shift. Only data is suppressed:
 * quiet paper-3 blocks hold the text slots.
 */

const CARD_COUNT = 9;

export default function StartupsLoading() {
  return (
    <div className="min-h-screen" style={{ background: "var(--cr-paper)" }} aria-busy="true">
      {/* The sticky navbar is mounted by the page, not the layout; hold its
          56px so the header sits exactly where it will land. */}
      <div style={{ height: "56px" }} aria-hidden />

      {/* ── Page header ── */}
      <div style={{ borderBottom: "1px solid var(--cr-rule)", padding: "48px 80px 32px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              {/* Ruled label: real copper bar, locale text suppressed. */}
              <div className="ruled-label" style={{ marginBottom: "12px" }}>
                <Skeleton w="72px" h="11px" />
              </div>
              {/* The h1 line box at the real serif metrics (clamp 32-48px at
                  1.1 line height), so the title streams in without a shift. */}
              <div style={{ height: "clamp(35px, 4.4vw, 53px)", display: "flex", alignItems: "center", marginBottom: "10px" }}>
                <Skeleton w="min(300px, 70vw)" h="clamp(28px, 3.6vw, 42px)" />
              </div>
              {/* Subtitle line box (15px body). */}
              <div style={{ height: "22px", display: "flex", alignItems: "center" }}>
                <Skeleton w="180px" h="12px" />
              </div>
            </div>

            {/* Sort + view-toggle slots, desktop only like the live controls. */}
            <div className="hidden lg:flex" style={{ alignItems: "center", gap: "10px" }}>
              <Skeleton w="110px" h="35px" />
              <Skeleton w="66px" h="31px" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter bar frame. The live bar is sticky; a dead surface has no
          scroll to stick against, so this one just holds the geometry. ── */}
      <div style={{ background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule-dark)" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "10px 80px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Search input slot */}
          <Skeleton w="200px" h="31px" />
          {/* Filter-group buttons (desktop) / the one Filters control (mobile) */}
          <div className="hidden lg:flex" style={{ gap: "8px" }}>
            <Skeleton w="92px" h="30px" />
            <Skeleton w="76px" h="30px" />
            <Skeleton w="64px" h="30px" />
          </div>
          <Skeleton w="84px" h="31px" className="lg:hidden" />
        </div>
      </div>

      {/* ── Card grid at true columns ── */}
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 80px 60px" }}>
        {/* Results-count line box (13px body at 20px bottom). */}
        <div style={{ height: "20px", display: "flex", alignItems: "center", marginBottom: "20px" }}>
          <Skeleton w="140px" h="11px" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {Array.from({ length: CARD_COUNT }).map((_, i) => (
            // Real card frame, suppressed contents -- the same geometry the
            // client's SkeletonCard renders while it fetches more rows.
            <div key={i} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
                <Skeleton w="40px" h="40px" />
                <div style={{ flex: 1 }}>
                  <Skeleton w="50%" h="14px" className="mb-2" />
                  <Skeleton w="75%" h="11px" />
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
                <Skeleton w="80px" h="20px" />
                <Skeleton w="56px" h="20px" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} h="52px" />
                ))}
              </div>
              {/* Hairline, not a box: inside a card, structure is rules. */}
              <div style={{ height: "1px", background: "var(--cr-rule)", marginBottom: "12px" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Skeleton w="60px" h="18px" />
                <Skeleton w="80px" h="14px" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
