"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * A small "i" that explains a term.
 *
 * This platform is full of vocabulary that is obvious to someone who has
 * raised before and opaque to everyone else — AI score, pre-money, soft
 * circle, SAFE, runway. A filter labelled "AI score ≥ 70" is useless to a
 * founder who does not know what the number is or who computed it, and
 * nobody clicks a filter they do not understand.
 *
 * Click, not hover: hover tooltips do not exist on touch, and this is most
 * needed on the phone. It closes on Escape, on outside click, and it is a
 * real <button> with aria-describedby so a screen reader gets the definition
 * rather than an unlabelled icon.
 */
export function InfoTip({ termKey, label }: {
  /** i18n key holding the explanation, e.g. "glossary.aiScore". */
  termKey: string;
  /** Optional accessible name; defaults to "What is this?". */
  label?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Fixed-position and clamped to the viewport. The first version anchored
  // the panel absolutely to the icon's left edge, which shoved a 288px panel
  // off-screen whenever the icon sat in the right half of a phone — the
  // explanation of a term is no explanation if you can read a third of it.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 6, left });
    };
    place();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const text = t(termKey);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
        aria-label={label ?? t("glossary.whatIsThis")}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        style={{
          background: "none", border: "none", padding: 0, marginLeft: 4,
          cursor: "pointer", color: open ? "var(--cr-copper)" : "var(--cr-ink-4)",
          display: "inline-flex", alignItems: "center", lineHeight: 0,
        }}
      >
        <Info style={{ width: 12, height: 12 }} />
      </button>

      {open && pos && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 80,
            width: `${Math.min(288, typeof window !== "undefined" ? window.innerWidth - 16 : 288)}px`,
            background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
            borderRadius: "4px", boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
            padding: "10px 12px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px",
            lineHeight: 1.5, color: "var(--cr-ink-2)", textTransform: "none",
            letterSpacing: "normal", textAlign: "left", whiteSpace: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
