"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The "?" cheat sheet.
 *
 * Three keyboard shortcuts now exist -- ⌘K for the palette, "/" to focus a
 * directory's search box, Esc to dismiss -- and nothing anywhere told anyone
 * they existed. A shortcut nobody can discover is a shortcut nobody uses.
 *
 * "?" only opens the sheet when the user is not typing: without that guard it
 * would swallow a question mark in a message, a pitch note or a search box,
 * which is a far worse bug than having no cheat sheet at all.
 */
const isTyping = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || n.isContentEditable;
};

export function ShortcutsHelp() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key !== "?" || isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const rows: Array<[string, string]> = [
    ["⌘K / Ctrl K", t("shortcuts.palette")],
    ["/", t("shortcuts.search")],
    ["↑ ↓", t("shortcuts.move")],
    ["Enter", t("shortcuts.open")],
    ["Esc", t("shortcuts.close")],
    ["?", t("shortcuts.help")],
  ];

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center"
      style={{ background: "rgba(26,22,18,0.45)", padding: "16px" }}
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("shortcuts.title")}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "var(--cr-paper-2)",
          border: "1px solid var(--cr-rule-dark)",
          borderRadius: "10px",
          boxShadow: "0 24px 64px rgba(26,22,18,0.28)",
          padding: "20px",
        }}
      >
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "17px", color: "var(--cr-ink)", marginBottom: "14px" }}>
          {t("shortcuts.title")}
        </p>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 14px", alignItems: "center" }}>
          {rows.map(([keys, label]) => (
            <div key={keys} style={{ display: "contents" }}>
              <dt>
                <kbd style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-2)",
                  border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "3px 7px",
                  background: "var(--cr-paper-3)", whiteSpace: "nowrap",
                }}>
                  {keys}
                </kbd>
              </dt>
              <dd style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)" }}>
                {label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
