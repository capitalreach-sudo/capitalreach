"use client";

import { useRef, useState, useEffect } from "react";

interface Props {
  children: React.ReactNode;
  strength?: number;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  as?: "button" | "a";
  href?: string;
}

export function MagneticButton({
  children,
  strength = 0.25,
  className,
  style,
  onClick,
  as: Tag = "button",
  href,
}: Props) {
  const ref     = useRef<HTMLElement>(null);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [active, setActive] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (reduced.current) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    setTx((e.clientX - cx) * strength);
    setTy((e.clientY - cy) * strength);
  };

  const onMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    setActive(true);
    onMouseMove(e);
  };

  const onMouseLeave = () => {
    setActive(false);
    setTx(0);
    setTy(0);
  };

  const transform = active
    ? `translate(${tx}px, ${ty}px)`
    : "translate(0px, 0px)";

  const transition = active
    ? "transform 150ms cubic-bezier(0.22, 0.61, 0.36, 1)"
    : "transform 400ms cubic-bezier(0.22, 0.61, 0.36, 1)";

  const commonProps = {
    ref: ref as React.RefObject<HTMLButtonElement & HTMLAnchorElement>,
    className,
    style: { ...style, transform, transition },
    onMouseMove,
    onMouseEnter,
    onMouseLeave,
    onClick,
  };

  if (Tag === "a") {
    return (
      <a {...commonProps} href={href}>
        {children}
      </a>
    );
  }

  return (
    <button {...commonProps}>
      {children}
    </button>
  );
}
