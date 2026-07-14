/** Interpolate {key} placeholders in a translated string. */
export function t(
  str: string,
  vars: Record<string, string | number> = {},
): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    str,
  );
}
