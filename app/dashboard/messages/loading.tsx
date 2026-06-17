export default function MessagesLoading() {
  return (
    <div className="min-h-screen bg-cr-paper animate-pulse">
      <div className="h-16 bg-cr-paper border-b" />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="h-8 w-40 bg-cr-p3 rounded mb-2" />
        <div className="h-4 w-64 bg-cr-p3 rounded mb-6" />
        <div className="flex h-[640px] rounded-2xl border border-cr-p4 overflow-hidden">
          <div className="w-80 flex-shrink-0 border-r bg-cr-p2/50 flex flex-col gap-0">
            <div className="p-3 border-b"><div className="h-9 bg-cr-p3 rounded-lg" /></div>
            <div className="p-3 border-b space-y-2">
              <div className="h-4 w-12 bg-cr-p3 rounded" />
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-6 w-16 bg-cr-p3 rounded-full" />
                ))}
              </div>
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3.5 border-b flex gap-3">
                <div className="h-10 w-10 rounded-full bg-cr-p3 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-cr-p3 rounded w-3/4" />
                  <div className="h-3 bg-cr-p3 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 bg-cr-p2/30 flex flex-col">
            <div className="h-14 border-b bg-cr-paper px-5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-cr-p3" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 bg-cr-p3 rounded" />
                <div className="h-3 w-20 bg-cr-p3 rounded" />
              </div>
            </div>
            <div className="flex-1 p-5 space-y-4">
              {[false, true, false, true, false].map((own, i) => (
                <div key={i} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div className={`h-12 rounded-2xl ${own ? "bg-cr-cu-l w-56" : "bg-cr-paper border w-64"}`} />
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t bg-cr-paper flex gap-2">
              <div className="flex-1 h-10 bg-cr-p3 rounded-xl" />
              <div className="h-10 w-10 bg-cr-p3 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
