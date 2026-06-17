export default function PricingLoading() {
  return (
    <div className="min-h-screen bg-cr-p2 animate-pulse">
      <div className="h-16 bg-cr-paper border-b" />
      <div className="py-20 text-center px-4">
        <div className="h-8 w-48 bg-cr-p3 rounded mx-auto mb-3" />
        <div className="h-12 w-96 bg-cr-p3 rounded-2xl mx-auto mb-4" />
        <div className="h-5 w-72 bg-cr-p3 rounded mx-auto" />
      </div>
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-96 bg-cr-paper rounded-2xl border" />
          ))}
        </div>
      </div>
    </div>
  );
}
