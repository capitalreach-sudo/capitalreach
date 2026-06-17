export default function DataLoading() {
  return (
    <div className="min-h-screen animate-pulse">
      <div className="h-16 bg-cr-paper border-b" />
      <div className="bg-[#0e0b30] py-14">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="h-8 w-72 bg-cr-paper/10 rounded-xl mb-3" />
          <div className="h-5 w-96 bg-cr-paper/8 rounded mb-10" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 bg-cr-paper/5 border border-white/10 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-10 max-w-6xl">
        <div className="h-12 w-64 bg-cr-p3 rounded-2xl mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-80 bg-cr-paper rounded-2xl border" />
          <div className="h-80 bg-cr-paper rounded-2xl border" />
        </div>
      </div>
    </div>
  );
}
