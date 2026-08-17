export default function AiLoading() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: "var(--cr-paper)" }} aria-busy="true">
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 pt-[120px] pb-12">
        <div className="h-4 w-40 rounded mb-6" style={{ background: "var(--cr-paper-3)" }} />
        <div className="h-12 w-[70%] rounded mb-3" style={{ background: "var(--cr-paper-3)" }} />
        <div className="h-12 w-[45%] rounded mb-6" style={{ background: "var(--cr-paper-3)" }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded" style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)" }} />)}
        </div>
        <div className="h-64 rounded" style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)" }} />
      </div>
    </div>
  );
}
