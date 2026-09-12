/**
 * The categorical palette for every chart on the platform.
 *
 * Every entry is a token or a color-mix of tokens, never a hex literal. The
 * registers repaint the tokens (warm dark lifts copper, the business style
 * remaps the copper family to emerald and flattens neutral to grey), and a
 * literal is the one colour that would refuse to follow. The set alternates
 * the warm accent family against the cool neutral family and steps lightness
 * between neighbours, so adjacent slices separate by lightness as well as
 * hue, which is the separation that survives colour-vision deficiency.
 *
 * Assigned in FIXED ORDER and never cycled: colour follows the entity, so a
 * filter that removes a series must not repaint the survivors. A seventh
 * category folds into "Other" rather than inventing a hue.
 *
 * Some pairs sit below 3:1 against the paper in some registers, which is fine
 * for a filled mark but means the charts must never rely on colour alone,
 * hence direct labels, a legend, and the table view behind every chart.
 */
export const SERIES = [
  "var(--cr-copper)",                                        // the brand accent, warm mid
  "var(--cr-neutral)",                                       // cool mid
  "var(--cr-copper-l)",                                      // warm light
  "color-mix(in srgb, var(--cr-neutral) 55%, var(--cr-ink))", // cool dark
  "var(--cr-copper-d)",                                      // warm dark
  "color-mix(in srgb, var(--cr-neutral) 45%, var(--cr-paper))", // cool pale
] as const;

/** "Everything else" is deliberately the quiet ink, not a category colour. */
export const OTHER = "var(--cr-ink-4)";

/** Fixed slot for an entity, so its colour never depends on rank or filters. */
export function seriesColor(index: number): string {
  return index < SERIES.length ? SERIES[index] : OTHER;
}
