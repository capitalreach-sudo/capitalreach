/**
 * The caller's IP, for rate-limit keying.
 *
 * The naive `x-forwarded-for.split(",")[0]` is client-spoofable: a caller can
 * PREPEND an arbitrary first hop and land in a fresh limiter bucket on every
 * request, defeating a per-IP ceiling. On Vercel the platform sets `x-real-ip`
 * to the true client address, which the client cannot forge, so prefer it. The
 * x-forwarded-for FIRST token is kept only as a local-dev fallback where
 * x-real-ip is absent -- in that environment there is no edge to spoof past.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
