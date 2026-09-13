"use client";

import { useRef } from "react";

export interface TabDef<K extends string> {
  key: K;
  label: string;
}

// The strip's caps voice matches the page label idiom: 11px caps on a 10px
// tracking base, quiet ink until selected.
const tabLabel: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 500,
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

/**
 * The house disclosure device: caps labels sharing one hairline, the active
 * tab marked by a 2px accent underline riding that hairline. Panels one at a
 * time; nothing is dropped, everything is a tap away.
 *
 * role="tablist" with roving focus: arrows move and select, Home/End jump.
 * Targets stay 40px tall for thumbs without adding padding that would break
 * the rhythm. Pair with TabPanel, which carries the matching panel ids and
 * the crossfade between panels.
 */
export function TabStrip<K extends string>({ tabs, active, onSelect, idBase, label, style }: {
  tabs: ReadonlyArray<TabDef<K>>;
  active: K;
  onSelect: (key: K) => void;
  /** Shared id stem wiring each tab to its TabPanel. */
  idBase: string;
  /** Accessible name for the tablist. */
  label: string;
  style?: React.CSSProperties;
}) {
  const refs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});

  const select = (key: K) => {
    onSelect(key);
    refs.current[key]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex(t => t.key === active);
    if (i === -1) return;
    // RTL is handled by the browser's focus order staying logical: Left and
    // Right step through the list in document order, which the strip renders.
    if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length].key);
    else if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length].key);
    else if (e.key === "Home") select(tabs[0].key);
    else if (e.key === "End") select(tabs[tabs.length - 1].key);
    else return;
    e.preventDefault();
  };

  return (
    <>
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{
        display: "flex", flexWrap: "wrap", gap: "0 24px",
        borderBottom: "1px solid var(--cr-rule-dark)",
        ...style,
      }}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(el) => { refs.current[tab.key] = el; }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.key}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel-${tab.key}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            style={{
              ...tabLabel,
              display: "inline-flex", alignItems: "center",
              minHeight: "40px", padding: 0,
              background: "none", cursor: "pointer",
              color: on ? "var(--cr-ink)" : "var(--cr-ink-4)",
              border: "none",
              // The active mark sits ON the strip's own hairline, not under it.
              borderBottom: on ? "2px solid var(--cr-copper)" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
    {/* The panel crossfade lives with the strip so every consumer gets the
        same swap. Keyed remounts restart the animation; reduced motion gets
        the finished panel with no interlude. */}
    <style>{`
      @keyframes cr-tab-fade { from { opacity: 0; } to { opacity: 1; } }
      .cr-tab-panel { animation: cr-tab-fade 160ms ease; }
      @media (prefers-reduced-motion: reduce) { .cr-tab-panel { animation: none; } }
    `}</style>
    </>
  );
}

/**
 * The panel a TabStrip discloses. Remounts on every swap (the key) so the
 * 160ms opacity crossfade runs once per change, never on unrelated renders.
 */
export function TabPanel({ idBase, active, children, style }: {
  idBase: string;
  /** The currently selected tab key; ids derive from it. */
  active: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      key={active}
      role="tabpanel"
      id={`${idBase}-panel-${active}`}
      aria-labelledby={`${idBase}-tab-${active}`}
      className="cr-tab-panel"
      style={style}
    >
      {children}
    </div>
  );
}
