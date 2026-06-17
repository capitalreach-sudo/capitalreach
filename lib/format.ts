export function formatCurrency(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000)         return `$${Math.round(n / 1_000)}k`;
  return `$${n.toLocaleString()}`;
}

export function formatGrowth(n: number): { text: string; positive: boolean } {
  return {
    text:     `${n >= 0 ? "+" : ""}${n}%`,
    positive: n >= 0,
  };
}

export function formatDate(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0)   return "Today";
  if (days === 1)   return "Yesterday";
  if (days < 7)     return `${days}d ago`;
  if (days < 30)    return `${Math.floor(days / 7)}w ago`;
  if (days < 365)   return `${Math.floor(days / 30)}mo ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString();
}

export const formatRelativeDate = formatDate;
