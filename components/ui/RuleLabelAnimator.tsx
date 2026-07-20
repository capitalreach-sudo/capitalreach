"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function RuleLabelAnimator() {
  const pathname = usePathname();

  useEffect(() => {
    const observe = () => {
      const labels = document.querySelectorAll(".ruled-label:not(.visible)");
      if (labels.length === 0) return;

      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("visible");
              obs.unobserve(e.target);
            }
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
    const t = setTimeout(() => { observe(); }, 300);

    return () => {
      obs1?.disconnect();
      clearTimeout(t);
    };
  }, [pathname]);

  return null;
}
