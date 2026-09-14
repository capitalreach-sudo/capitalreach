/**
 * Whether this deployment may be indexed by search engines.
 *
 * Staging serves the same pages as production from its own database, and with
 * index,follow it competes with production in search: capitalreach-staging
 * answered index,follow over a fully seeded demo market. Vercel preview builds
 * are excluded by VERCEL_ENV; a separate staging project reports "production"
 * in its own VERCEL_ENV, so it is excluded by host; NEXT_PUBLIC_NOINDEX=1 turns
 * indexing off anywhere else that needs it.
 */
export function deploymentIndexable(host: string | null | undefined): boolean {
  if (process.env.NEXT_PUBLIC_NOINDEX === "1") return false;
  if (process.env.VERCEL_ENV === "preview") return false;
  if (host && /staging/i.test(host)) return false;
  return true;
}

export function requestHost(h: { get(name: string): string | null }): string | null {
  return h.get("x-forwarded-host") ?? h.get("host");
}
