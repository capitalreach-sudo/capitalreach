import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 24px" }}>
      <Skeleton w="240px" h="34px" className="mb-6" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "28px" }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h="92px" />)}
      </div>
      <Skeleton h="260px" />
    </div>
  );
}
