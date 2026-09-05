"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The shared "there is nothing here" block.
 *
 * Every list surface had grown its own version -- different padding, different
 * type sizes, some with an icon, some with a way out and some that just said
 * "No results" and left the user to work out what to do next. An empty state
 * is the moment a user is most likely to leave, so it is the last place the
 * product should look unfinished.
 *
 * `action` is deliberately not optional-by-convention: an empty state without
 * a way forward is a dead end, so callers have to decide consciously to omit
 * it (a filtered list whose only sensible action is "clear filters" always has
 * one).
 */
export function EmptyState({
  Icon,
  title,
  body,
  action,
}: {
  Icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "10px",
        padding: "48px 24px",
        border: "1px dashed var(--cr-rule-dark)",
        borderRadius: "8px",
        background: "var(--cr-paper-2)",
      }}
    >
      {/* The drawer tag: empty lists are museum drawers, and drawers are
          labelled even when nothing is filed in them. */}
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--cr-ink-4)" }}>
        {t("common.emptyDrawer")}
      </span>
      {Icon && (
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: "var(--cr-copper-bg)",
            color: "var(--cr-copper)",
          }}
        >
          <Icon size={18} />
        </span>
      )}
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 700,
          fontSize: "17px",
          color: "var(--cr-ink)",
        }}
      >
        {title}
      </p>
      {body && (
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize: "13px",
            lineHeight: 1.6,
            color: "var(--cr-ink-4)",
            maxWidth: "38ch",
          }}
        >
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: "4px" }}>{action}</div>}
    </div>
  );
}
