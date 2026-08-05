"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { isPresetActive, clearPreset } from "@/lib/search-presets";

/**
 * Horizontal chip row of one-click filter shortcuts. Clicking an inactive
 * preset applies its whole patch; clicking an active one removes exactly
 * what that preset contributed, leaving any filter the user set by hand.
 */
export function FilterPresets({
  presets,
  filters,
  defaults,
  onApply,
}: {
  presets: Array<{ id: string; emoji: string; labelKey: string; patch: Record<string, unknown> }>;
  filters: Record<string, unknown>;
  defaults: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        overflowX: "auto",
        padding: "2px 0",
        scrollbarWidth: "none",
      }}
    >
      {presets.map((p) => {
        const active = isPresetActive(p.patch, filters);
        return (
          <button
            key={p.id}
            onClick={() => onApply(active ? clearPreset(p.patch, filters, defaults) : p.patch)}
            aria-pressed={active}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              flexShrink: 0,
              minHeight: "36px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: active ? 600 : 400,
              fontSize: "12px",
              padding: "7px 14px",
              borderRadius: "999px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              border: active ? "1px solid var(--cr-copper)" : "1px solid var(--cr-rule-dark)",
              background: active ? "var(--cr-copper)" : "var(--cr-paper-2)",
              color: active ? "#fff" : "var(--cr-ink-3)",
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            <span aria-hidden style={{ opacity: active ? 0.9 : 0.55 }}>{p.emoji}</span>
            {t(p.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
