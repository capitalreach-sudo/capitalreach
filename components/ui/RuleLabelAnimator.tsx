"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// True once React has actually attached to (hydrated) this exact DOM node.
// A streamed Suspense boundary (see app/startups/page.tsx's fallback, for
// one) can put its real server HTML into the document before React's own
// hydration walk reaches it, so the plain document.querySelectorAll scan
// below can find a node that is sitting there as inert HTML, not yet
// reconciled by React. Marking that node immediately used to race React's
// own commit for it: React would later hydrate against the server markup,
// find a data-cr-visible attribute it never rendered, and discard the whole
// boundary rather than reconcile it, which is a real, confirmed hydration
// failure (seen as "Extra attributes from the server: data-cr-visible" in
// dev, and the page briefly client-rendering that section from scratch).
// Checking for React's own internal fiber key is the only way to tell, from
// outside React, whether a given node has actually been claimed yet.
function isReactHydrated(el: Element): boolean {
  return Object.keys(el).some((k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"));
}

export function RuleLabelAnimator() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Only marks the element once React has hydrated it. A label that
    // intersects while still unhydrated streamed HTML is polled a few
    // frames at a time (bounded) rather than marked on the spot, so the
    // mutation can never land ahead of React's own commit for that node.
    const markWhenHydrated = (el: HTMLElement, obs: IntersectionObserver, attempt = 0) => {
      if (cancelled) return;
      if (isReactHydrated(el) || attempt >= 60) {
        // data-cr-visible rather than a class: React manages className, so a
        // class added here from outside React tripped dev hydration warnings
        // on soft navigations. React leaves unknown data attributes alone,
        // once it has actually hydrated the node that carries them.
        el.dataset.crVisible = "1";
        obs.unobserve(el);
        return;
      }
      timers.push(setTimeout(() => markWhenHydrated(el, obs, attempt + 1), 50));
    };

    const observe = () => {
      const labels = document.querySelectorAll<HTMLElement>(".ruled-label:not([data-cr-visible])");
      if (labels.length === 0) return;

      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) markWhenHydrated(e.target as HTMLElement, obs);
          });
        },
        { threshold: 0.5 },
      );
      labels.forEach((el) => obs.observe(el));
      return obs;
    };

    // Run immediately and again after a short delay to catch
    // elements rendered after hydration
    const obs1 = observe();
    timers.push(setTimeout(() => { observe(); }, 300));

    return () => {
      cancelled = true;
      obs1?.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [pathname]);

  return null;
}
