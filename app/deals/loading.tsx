export default function DealsLoading() {
  // Deal portal skeleton: header, four stat cards, five kanban columns.
  return (
    <div className="min-h-screen animate-pulse" style={{ background: "var(--cr-paper)" }} aria-busy="true">
      <div className="max-w-[1200px] mx-auto px-6 pt-[100px] pb-16">
        <div className="h-4 w-28 rounded mb-3" style={{ background: "var(--cr-paper-3)" }} />
        <div className="h-9 w-80 rounded mb-8" style={{ background: "var(--cr-paper-3)" }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded" style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)" }} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-72 rounded" style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)" }} />)}
        </div>
      </div>
    </div>
  );
}
