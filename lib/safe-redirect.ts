/**
 * Where a ?redirect= is allowed to send somebody.
 *
 * The rule looks obvious and is not. `/^\/(?!\/)/` -- starts with a slash, and
 * the next character is not a slash -- reads as "a path on this site", and it
 * does stop the familiar `//evil.com`. It does not stop `/\evil.com`: the
 * second character is a backslash, so the lookahead is satisfied, and every
 * browser folds a leading `/\` into a protocol-relative URL and leaves the
 * site. That is an open redirect on the sign-in page, which is the one page
 * where it is worth most: the victim has just been asked for a password, and
 * the attacker's copy of the form is one hop away.
 *
 * So this allows a path and nothing else. One leading slash, no second slash,
 * no backslash anywhere, and no whitespace or control character -- a browser
 * discards several of those while parsing, so a string containing one is not
 * the string the browser will act on. Anything that does not qualify falls
 * back rather than being repaired: a redirect target that needed repairing is
 * not one worth honouring.
 */
export function safeRedirect(raw: string | null | undefined, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;

  // Judged as it arrived, never trimmed. A value that only passes after
  // trimming is a value someone is trying to sneak past a trim.
  if (raw.includes("\\")) return fallback;

  // Whitespace plus the C0 and C1 control ranges.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001F\u007F-\u009F]/.test(raw)) return fallback;

  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;

  return raw;
}
