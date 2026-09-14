export default function InvestorsLoading() {
  return (
    <div className="min-h-screen bg-cr-p2 animate-pulse">
      <div className="h-16 bg-cr-paper border-b" />
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="h-10 w-64 bg-cr-p3 rounded-xl mx-auto mb-3" />
        <div className="h-6 w-96 bg-cr-p3 rounded mx-auto mb-10" />
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0 hidden lg:block">
            <div className="h-[500px] bg-cr-paper rounded-2xl border" />
          </div>
          {/* Grid */}
          <div className="flex-1">
            <div className="h-11 bg-cr-paper rounded-xl border mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-52 rounded-2xl bg-cr-paper border" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
