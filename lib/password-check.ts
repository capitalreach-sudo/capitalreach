/**
 * Has this password appeared in a known breach?
 *
 * k-anonymity against the Have I Been Pwned range API: the password is
 * SHA-1 hashed locally and only the FIRST FIVE hex characters leave the
 * device. The API returns every breached hash suffix in that bucket
 * (several hundred), and the match happens locally — HIBP never sees the
 * password, the hash, or enough of it to reconstruct either. This is the
 * standard scheme browsers and password managers use.
 *
 * Fails OPEN on any error: if HIBP is down or blocked, signup must not
 * break. A breached password slipping through on HIBP's bad day is a
 * smaller failure than nobody being able to register.
 */
export async function isPasswordBreached(password: string): Promise<{ breached: boolean; count: number }> {
  try {
    const data = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest("SHA-1", data);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const prefix = hex.slice(0, 5);
    const suffix = hex.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Padded responses make every bucket the same size on the wire, so a
      // network observer cannot infer the bucket's popularity either.
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { breached: false, count: 0 };

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [lineSuffix, countStr] = line.trim().split(":");
      if (lineSuffix === suffix) {
        const count = parseInt(countStr, 10) || 1;
        return { breached: count > 0, count };
      }
    }
    return { breached: false, count: 0 };
  } catch {
    return { breached: false, count: 0 };
  }
}
