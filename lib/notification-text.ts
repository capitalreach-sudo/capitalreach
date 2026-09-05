/**
 * Render a notification in the reader's language (migration 108).
 *
 * A keyed notification carries title_key/body_key + params and is rendered
 * through t() at READ time, so the same row speaks German to a German founder
 * and Japanese to a Japanese investor. Rows without keys -- everything sent
 * before 108, and senders not yet converted -- fall back to their stored
 * English verbatim, which is exactly what they said when they were sent.
 */
type Keyed = {
  title: string;
  body?: string | null;
  title_key?: string | null;
  body_key?: string | null;
  params?: Record<string, string | number> | null;
};
type T = (key: string, vars?: Record<string, string | number>) => string;

export function notifTitle(n: Keyed, t: T): string {
  if (n.title_key) {
    const out = t(n.title_key, n.params ?? undefined);
    if (out !== n.title_key) return out; // key resolved
  }
  return n.title;
}

export function notifBody(n: Keyed, t: T): string | null {
  if (n.body_key) {
    const out = t(n.body_key, n.params ?? undefined);
    if (out !== n.body_key) return out;
  }
  return n.body ?? null;
}
