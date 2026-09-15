import Link from "next/link";
import { seriesColor } from "./palette";

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Palette slot. Omit for the single ink a ranked list needs. */
  colorIndex?: number;
}

const SANS = "var(--font-dm-sans), system-ui, sans-serif";
const MONO = "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace";

/**
 * Magnitude across categories, ranked.
 *
 * Horizontal because the labels are words. Rendered as a real table: the
 * label is the row header, the bar is decoration, and the value is text, so
 * a screen reader and a touch reader get every figure without hovering.
 * Nothing moves and nothing is revealed on hover.
 */
export function BarChart({ bars, format, hrefFor, caption }: {
  bars: Bar[];
  format?: (n: number) => string;
  /** Where a bar's label leads. A count is a question; the list is the answer. */
  hrefFor?: (key: string) => string | null;
  /** Accessible table caption, e.g. the section title. */
  caption?: string;
}) {
  const max = Math.max(1, ...bars.map(b => b.value));

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      {caption && <caption className="sr-only">{caption}</caption>}
      <tbody>
        {bars.map((b) => {
          const pct = (b.value / max) * 100;
          const href = hrefFor?.(b.key) ?? null;
          const fill = b.colorIndex === undefined ? "var(--cr-ink-3)" : seriesColor(b.colorIndex);
          return (
            <tr key={b.key} className="cr-bar-row">
              <th scope="row" style={{
                fontFamily: SANS, fontSize: "0.8125rem", fontWeight: 400, lineHeight: 1.4,
                color: "var(--cr-ink-2)", textAlign: "start", whiteSpace: "nowrap",
                width: "1%", height: "2.75rem", padding: 0, paddingInlineEnd: "0.75rem",
              }}>
                {href ? (
                  <Link href={href} className="cr-link" style={{ display: "inline-flex", alignItems: "center", minHeight: "2.75rem" }}>
                    {b.label}
                  </Link>
                ) : b.label}
              </th>
              <td style={{ padding: 0, width: "100%" }}>
                <div aria-hidden className="cr-grow-w" style={{
                  height: "0.5rem",
                  width: `${Math.max(pct, b.value > 0 ? 2 : 0)}%`,
                  background: fill,
                }} />
              </td>
              <td style={{
                fontFamily: MONO, fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.4,
                color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums",
                textAlign: "end", whiteSpace: "nowrap", padding: 0, paddingInlineStart: "0.75rem",
              }}>
                {format ? format(b.value) : b.value}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
