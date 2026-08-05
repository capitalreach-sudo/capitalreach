/**
 * One-click shortcuts that apply several filters at once.
 *
 * Each preset is a partial filter patch plus the exact test for "is this
 * preset currently on", so clicking an active preset can clear precisely
 * what it set and nothing else. Values match the real option lists in
 * types/index.ts (INDUSTRIES, STAGES) -- a preset naming an industry the
 * database never stores would look broken rather than empty.
 */

export interface StartupPreset {
  id: string;
  emoji: string;
  labelKey: string;
  patch: Record<string, unknown>;
}

export const STARTUP_PRESETS: StartupPreset[] = [
  { id: "preseed_ai", emoji: "✦", labelKey: "presets.preseedAi",
    patch: { stages: ["pre-seed"], industries: ["AI / Machine Learning"] } },
  { id: "revenue",    emoji: "▲", labelKey: "presets.revenueStage",
    patch: { mrrMin: 25_000 } },
  { id: "germany",    emoji: "◆", labelKey: "presets.germany",
    patch: { country: "Germany" } },
  { id: "high_score", emoji: "★", labelKey: "presets.highScore",
    patch: { aiScoreMin: 80 } },
  { id: "new_week",   emoji: "●", labelKey: "presets.newThisWeek",
    patch: { newOnly: true } },
  { id: "big_raise",  emoji: "€", labelKey: "presets.bigRaise",
    patch: { raisingMin: 2_000_000 } },
];

export interface InvestorPreset {
  id: string;
  emoji: string;
  labelKey: string;
  patch: Record<string, unknown>;
}

export const INVESTOR_PRESETS: InvestorPreset[] = [
  { id: "leads",     emoji: "◆", labelKey: "presets.leadInvestors", patch: { leadOnly: true } },
  { id: "angels",    emoji: "✦", labelKey: "presets.preseedAngels",
    patch: { types: ["angel"], stages: ["pre-seed"] } },
  { id: "verified",  emoji: "✓", labelKey: "presets.verifiedOnly",  patch: { verifiedOnly: true } },
  { id: "seriesa",   emoji: "▲", labelKey: "presets.seriesAVcs",
    patch: { types: ["vc"], stages: ["series_a"] } },
  { id: "new_month", emoji: "●", labelKey: "presets.newThisMonth",  patch: { newOnly: true } },
];

/** True when every key the preset sets currently holds the preset's value. */
export function isPresetActive(patch: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(patch).every(([k, v]) => {
    const cur = filters[k];
    if (Array.isArray(v)) {
      return Array.isArray(cur) && v.every((x) => (cur as unknown[]).includes(x));
    }
    return cur === v;
  });
}

/** The patch that undoes a preset: arrays lose the preset's members, scalars reset. */
export function clearPreset(
  patch: Record<string, unknown>,
  filters: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (Array.isArray(v)) {
      const cur = (filters[k] as unknown[]) ?? [];
      out[k] = cur.filter((x) => !v.includes(x));
    } else {
      out[k] = defaults[k] ?? (typeof v === "boolean" ? false : typeof v === "number" ? 0 : "");
    }
  }
  return out;
}
