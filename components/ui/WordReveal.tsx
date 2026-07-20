"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  className?: string;
  delay?: number; // ms between each word appearing
  threshold?: number; // IntersectionObserver threshold
  as?: keyof JSX.IntrinsicElements;
}

export function WordReveal({
  text,
  className = "",
  delay = 80,
  threshold = 0.2,
  as: Tag = "span",
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  const words = text.split(" ");

  return (
    // @ts-expect-error dynamic tag
    <Tag ref={ref} className={className} aria-label={text} style={{ display: "inline" }}>
      {words.map((word, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(12px)",
            transition: `opacity 0.45s ease ${i * delay}ms, transform 0.45s ease ${i * delay}ms`,
            whiteSpace: "pre",
          }}
        >
          {word}{i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
