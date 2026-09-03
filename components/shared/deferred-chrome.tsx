"use client";

import dynamic from "next/dynamic";

/**
 * Global chrome nobody needs during first paint. The palette opens on ⌘K —
 * it does not belong in the critical bundle of every page. Loaded after
 * hydration, rendered only client-side.
 *
 * The floating "Ask" assistant bubble was retired (Jack, 2026-09-03): a
 * pop-up hovering over every public page read as clutter. The component and
 * its /api/assistant backend stay in the tree, so re-mounting it here is a
 * two-line change if it ever earns its place back.
 */
const CommandPalette = dynamic(
  () => import("@/components/shared/command-palette").then(m => m.CommandPalette),
  { ssr: false },
);

export function DeferredChrome() {
  return <CommandPalette />;
}
