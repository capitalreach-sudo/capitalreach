"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  texts: string[];
  speed?: number;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
  cursorStyle?: React.CSSProperties;
}

export function TypewriterText({
  texts,
  speed   = 48,
  delay   = 1600,
  className,
  style,
  cursorStyle,
}: Props) {
  const [displayed, setDisplayed] = useState("");
  const [textIdx,   setTextIdx]   = useState(0);
  const [phase,     setPhase]     = useState<"typing" | "pausing" | "erasing">("typing");
  const [cursorOn,  setCursorOn]  = useState(true);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Cursor blink
  useEffect(() => {
    const id = setInterval(() => setCursorOn(v => !v), 530);
    return () => clearInterval(id);
  }, []);

  // Typing machine
  useEffect(() => {
    if (reducedMotion.current) {
      setDisplayed(texts[0] ?? "");
      return;
    }

    const current = texts[textIdx] ?? "";

    if (phase === "typing") {
      if (displayed.length < current.length) {
        const id = setTimeout(
          () => setDisplayed(current.slice(0, displayed.length + 1)),
          speed,
        );
        return () => clearTimeout(id);
      }
      // Finished typing — pause
      const id = setTimeout(() => setPhase("pausing"), delay);
      return () => clearTimeout(id);
    }

    if (phase === "pausing") {
      // If only one text, stay
      if (texts.length === 1) return;
      const id = setTimeout(() => setPhase("erasing"), delay);
      return () => clearTimeout(id);
    }

    if (phase === "erasing") {
      if (displayed.length > 0) {
        const id = setTimeout(
          () => setDisplayed(displayed.slice(0, -1)),
          speed * 0.55,
        );
        return () => clearTimeout(id);
      }
      // Advance to next text
      setTextIdx(i => (i + 1) % texts.length);
      setPhase("typing");
    }
  }, [displayed, phase, textIdx, texts, speed, delay]);

  return (
    <span className={className} style={style}>
      {displayed}
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width:   "0.08em",
          height:  "0.9em",
          background: "#B5651D",
          marginLeft: "3px",
          verticalAlign: "text-bottom",
          borderRadius: "1px",
          opacity: cursorOn ? 1 : 0,
          transition: "opacity 80ms",
          ...cursorStyle,
        }}
      />
    </span>
  );
}
