import { StartupsDirectorySkeleton } from "@/components/startup/startups-search";

/**
 * Startup directory loading state, at the live page's geometry: the header
 * line, the 44px filter bar and six ledger rows, drawn by the same component
 * the page uses as its Suspense fallback. The navbar is mounted by the page,
 * not the layout, so its slot is held here.
 */
export default function StartupsLoading() {
  return (
    <main aria-busy="true" style={{ backgroundColor: "var(--cr-paper)", minHeight: "100vh" }}>
      <div aria-hidden="true" style={{ height: "var(--cr-sticky-top)" }} />
      <StartupsDirectorySkeleton />
    </main>
  );
}
