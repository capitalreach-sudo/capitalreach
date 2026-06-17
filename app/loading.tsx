export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-[#080808] animate-pulse">
      {/* Hero skeleton */}
      <div className="relative overflow-hidden bg-[#080808] min-h-[680px] flex items-center">
        <div className="container mx-auto px-4 py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div>
              <div className="h-8 w-64 bg-base/10 rounded-full mb-7" />
              <div className="h-16 w-4/5 bg-base/10 rounded-2xl mb-3" />
              <div className="h-16 w-3/5 bg-base/10 rounded-2xl mb-5" />
              <div className="h-5 w-full max-w-lg bg-base/8 rounded-lg mb-2" />
              <div className="h-5 w-3/4 max-w-lg bg-base/8 rounded-lg mb-9" />
              <div className="flex gap-3 mb-10">
                <div className="h-12 w-44 bg-cr-cu-d/40 rounded-xl" />
                <div className="h-12 w-44 bg-base/8 rounded-xl" />
              </div>
            </div>
            <div className="hidden lg:block relative h-[380px]">
              {[0, 1, 2].map(i => (
                <div key={i} className="absolute w-64 h-36 rounded-2xl bg-base/5 border border-white/10"
                  style={{ top: i * 105, left: i * 52 }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features strip skeleton */}
      <div className="bg-base py-14">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="h-6 w-48 bg-[#1a1a1a] rounded mx-auto mb-3" />
          <div className="h-9 w-80 bg-[#1a1a1a] rounded mx-auto mb-10" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-cr-p2" />
            ))}
          </div>
        </div>
      </div>

      {/* Marketplace skeleton */}
      <div className="container mx-auto px-4 py-10">
        <div className="flex gap-8">
          <div className="w-64 hidden lg:block">
            <div className="h-96 rounded-xl bg-cr-p2" />
          </div>
          <div className="flex-1">
            <div className="h-11 rounded-xl bg-cr-p2 mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 rounded-2xl bg-cr-p2" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
