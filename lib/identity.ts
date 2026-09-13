/**
 * Identity protection (Phase 1, mechanism A).
 *
 * Until an investor has opened a deal with a startup — which requires the
 * non-circumvention acknowledgment — the founders' identities are partly
 * masked: "Sarah Kim" renders as "Sarah K.", and LinkedIn / X handles are
 * removed entirely. That makes going around CapitalReach harder than paying
 * the 2%: you cannot look someone up from the listing alone.
 *
 * Masking happens on the SERVER before the founders array is handed to any
 * client component, so the hidden fields never reach the browser.
 */

// Any Unicode letter. Built via the constructor because the tsconfig target
// predates the /u literal syntax; every supported runtime (ES2018+) has it.
const ANY_LETTER = new RegExp("\\p{L}", "u");

export function maskName(fullName: string | null | undefined): string {
  const name = (fullName ?? "").trim();
  if (!name) return "";
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  // The initial must be a LETTER: names arrive decorated ("Testfirma Founder
  // (demo)", "Jane Doe ★"), and "Testfirma (." is not a masked name. Walk
  // back to the last token that contains a letter and take its first letter;
  // a name with no letter past the first token keeps just that token.
  for (let i = parts.length - 1; i >= 1; i--) {
    const letter = parts[i].match(ANY_LETTER);
    if (letter) return `${first} ${letter[0].toUpperCase()}.`;
  }
  return first;
}

export interface FounderLike {
  name: string;
  linkedin_url?: string | null;
  twitter_url?: string | null;
}

/**
 * Returns founders as-is when `reveal` is true (viewer has a deal, is the
 * owner, or is an admin). Otherwise masks names and strips social URLs.
 */
export function protectFounders<T extends FounderLike>(founders: T[] | null | undefined, reveal: boolean): T[] {
  const list = founders ?? [];
  if (reveal) return list;
  return list.map((f) => ({ ...f, name: maskName(f.name), linkedin_url: null, twitter_url: null }));
}

/** Masks an IP for display on a shared timeline: "84.12.•.•" / "2a02:…". */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return "—";
  if (ip.includes(":")) return ip.split(":").slice(0, 2).join(":") + ":…";
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.•.•` : "•.•.•.•";
}
