"use client";

import { useEffect, useState } from "react";

/**
 * Mobile-only action bar that appears once the page's own action row has
 * scrolled away.
 *
 * A profile page puts its actions in the header, where they wrap into a block
 * of eight buttons on a phone. The moment a reader scrolls down to the part
 * that actually decides them -- the traction, the deck, the ask -- every
 * action is off screen and the only way back is to scroll to the top. This
 * keeps the two or three that matter within thumb reach the whole way down.
 *
 * Scroll position, not an IntersectionObserver on a sentinel: the observer
 * needs a ref threaded through the caller's JSX, and it reports nothing at all
 * in a headless pane, which makes the bar impossible to verify. A threshold is
 * dumber and always true.
 */
export function StickyActionBar({
  children,
  showAfter = 340,
}: {
  children: React.ReactNode;
  showAfter?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > showAfter);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showAfter]);

  return (
    <div
      className="lg:hidden"
      aria-hidden={!visible}
      style={{
        position: "fixed",
        insetInline: 0,
        // Rides directly on top of the mobile tab bar; --cr-tabbar-h is 0 for
        // signed-out readers, where the bar simply sits on the viewport floor.
        bottom: "var(--cr-tabbar-h, 0px)",
        zIndex: 85,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 14px",
        background: "var(--cr-paper-2)",
        borderTop: "1px solid var(--cr-rule-dark)",
        boxShadow: "0 -6px 20px rgba(26,22,18,0.06)",
        transform: visible ? "translateY(0)" : "translateY(110%)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "transform 180ms ease, opacity 180ms ease",
      }}
    >
      {children}
    </div>
  );
}
