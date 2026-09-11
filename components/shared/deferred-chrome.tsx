"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * The root layout's two slots for chrome that must not sit in the critical
 * bundle of every route.
 *
 * All of this used to be static imports in app/layout.tsx, which put it in the
 * shared chunk of EVERY page: /terms and /privacy paid for a command palette,
 * a mobile tab bar and two toast hosts in order to render static text.
 * ssr:false moves the code into lazy chunks, and the idle gate below keeps
 * those chunks from being requested while the browser is still busy with the
 * page the visitor actually asked for.
 *
 * What stays in the first paint, and why, is as much the point as what left:
 * SkipToContent is the first stop in the tab order, and LiveRegion has to be
 * in the DOM before the first announce() call can look for it.
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

const DeferredChromeContent = dynamic(
  () => import("@/components/shared/deferred-chrome-content").then(m => m.DeferredChromeContent),
  { ssr: false },
);

const LaunchBanner = dynamic(
  () => import("@/components/ui/LaunchBanner").then(m => m.LaunchBanner),
  { ssr: false },
);

/**
 * True once the browser has a moment to spare.
 *
 * The timeout is the load-bearing half: a main thread that never goes idle
 * would otherwise never mount the tab bar or the toast hosts at all, and a
 * mid-range phone hydrating a listing page is exactly that thread. One second
 * is well past a first paint and well short of a visitor reaching for ⌘K.
 */
function useIdle(): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const ready = () => setIdle(true);
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(ready, { timeout: 1000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    // Safari only shipped requestIdleCallback in 16.4.
    const timer = window.setTimeout(ready, 200);
    return () => window.clearTimeout(timer);
  }, []);

  return idle;
}

/**
 * Top-of-body slot. The launch banner is flow content that pushes the page
 * down, so unlike the rest of the chrome it cannot be mounted at the end of
 * the body -- it has to render where it belongs. Deferred for its fetch rather
 * than its weight: /api/launch-status fired on every page load, in parallel
 * with the requests that decide when the page paints, and the banner renders
 * nothing at all until that answer comes back.
 */
export function DeferredBanner() {
  const idle = useIdle();
  return idle ? <LaunchBanner /> : null;
}

/** End-of-body slot: fixed and hidden things, none of which anchor to flow. */
export function DeferredChrome() {
  const idle = useIdle();
  if (!idle) return null;
  return (
    <>
      <DeferredChromeContent />
      <CommandPalette />
    </>
  );
}
