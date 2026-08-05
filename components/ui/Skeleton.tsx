/** The one loading rectangle. Same paper tones everywhere. */
export function Skeleton({ w, h, className = "" }: { w?: string; h?: string; className?: string }) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{ width: w, height: h, background: "var(--cr-paper-3)", borderRadius: "4px" }}
    />
  );
}
