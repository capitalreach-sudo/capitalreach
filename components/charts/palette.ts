/**
 * The categorical palette for every chart on the platform.
 *
 * Validated rather than chosen by eye: run through the six checks (lightness
 * band, chroma floor, colour-vision-deficiency separation on adjacent pairs,
 * normal-vision floor, contrast against the paper surface) and adjusted until
 * all of them passed. Slot 1 is the brand copper; the rest are stepped to sit
 * beside it without collapsing into it for a red-green or blue-yellow reader.
 *
 * Assigned in FIXED ORDER and never cycled: colour follows the entity, so a
 * filter that removes a series must not repaint the survivors. A ninth
 * category folds into "Other" rather than inventing a hue.
 *
 * Three of these fall below 3:1 against the paper background, which is fine
 * for a filled mark but means the charts must never rely on colour alone —
 * hence direct labels, a legend, and the table view behind every chart.
 */
export const SERIES = [
  "#B5651D", // copper — the brand
  "#1baf7a", // aqua
  "#2a78d6", // blue
  "#eda100", // yellow
  "#6B4E9B", // violet
  "#e87ba4", // magenta
] as const;

export const OTHER = "#9C8E82";      // --cr-ink-4: "everything else" is deliberately grey
export const GRID = "rgba(107,96,86,0.14)";
export const AXIS_TEXT = "#9C8E82";
export const SURFACE = "#FAF7F2";

/** Fixed slot for an entity, so its colour never depends on rank or filters. */
export function seriesColor(index: number): string {
  return index < SERIES.length ? SERIES[index] : OTHER;
}
