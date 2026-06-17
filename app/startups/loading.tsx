export default function StartupsLoading() {
  return (
    <div className="min-h-screen bg-cr-p2/40 animate-pulse">
      {/* Hero */}
      <div className="bg-cr-paper border-b border-cr-p4 py-10">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="h-4 w-32 bg-cr-p3 rounded mb-3" />
          <div className="h-8 w-72 bg-cr-p3 rounded mb-2" />
          <div className="h-4 w-96 bg-cr-p3 rounded mb-6" />
          <div className="h-12 w-full max-w-2xl bg-cr-p3 rounded-xl" />
        </div>
      </div>
      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-7xl flex gap-8">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 hidden lg:block">
          <div className="h-96 bg-cr-paper rounded-2xl border border-cr-p4" />
        </div>
        {/* Grid */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-52 bg-cr-paper rounded-2xl border border-cr-p4" />
          ))}
        </div>
      </div>
    </div>
  );
}
