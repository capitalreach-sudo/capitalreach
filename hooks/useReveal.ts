"use client";
import { useEffect, useRef } from "react";

export function useReveal(threshold = 0.08) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("visible");
          // Stagger children with reveal-child class
          const children = el.querySelectorAll(".reveal-child");
          children.forEach((child, i) => {
            setTimeout(() => child.classList.add("visible"), i * 80);
          });
          obs.unobserve(el);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return ref;
}
