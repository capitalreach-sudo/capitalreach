"use client";

import dynamic from "next/dynamic";

/**
 * Global chrome nobody needs during first paint. The palette opens on ⌘K,
 * the assistant on a click — neither belongs in the critical bundle of
 * every page. Loaded after hydration, rendered only client-side.
 */
const CommandPalette = dynamic(
  () => import("@/components/shared/command-palette").then(m => m.CommandPalette),
  { ssr: false },
);
const SiteAssistant = dynamic(
  () => import("@/components/shared/site-assistant").then(m => m.SiteAssistant),
  { ssr: false },
);

export function DeferredChrome() {
  return (
    <>
      <CommandPalette />
      <SiteAssistant />
    </>
  );
}
