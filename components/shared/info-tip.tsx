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
export function InfoTip({ termKey, label, align = "left" }: {
  /** i18n key holding the explanation, e.g. "glossary.aiScore". */
  termKey: string;
  /** Optional accessible name; defaults to "What is this?". */
  label?: string;
  align?: "left" | "right";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
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

      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "absolute", top: "calc(100% + 6px)", zIndex: 50,
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            width: "max(220px, 18rem)", maxWidth: "min(20rem, 80vw)",
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
