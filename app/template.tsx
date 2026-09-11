"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The cross-fade between pages.
 *
 * The first paint is deliberately NOT faded. This wrapper used to render
 * opacity:0 into the server HTML and raise it only once React had hydrated and
 * two frames had passed, which put the whole document behind the JS bundle: on
 * a phone nothing was visible until hydration finished, so First Contentful
 * Paint measured hydration rather than paint. It also meant a failed or blocked
 * bundle left a fully rendered page permanently invisible.
 *
 * Starting visible costs the fade on initial load and keeps it on every
 * navigation after, which is where it was actually doing work -- the first load
 * has nothing to cross-fade FROM.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settled = useRef(false);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // The mount pass is the first paint, not a navigation.
    if (!settled.current) {
      settled.current = true;
      return;
    }
    // Inline styles outrank the stylesheet, so the global reduced-motion block
    // cannot reach the transition below. Honour the preference here instead.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    setFading(true);
    setVisible(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transition: fading ? "opacity 300ms ease" : undefined,
        // Only while a fade is actually running: a permanent will-change on a
        // full-page wrapper holds a compositor layer for the whole document.
        willChange: fading ? "opacity" : undefined,
      }}
      onTransitionEnd={() => setFading(false)}
    >
      {children}
    </div>
  );
}
