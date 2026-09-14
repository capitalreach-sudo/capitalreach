import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * EmptyState: one quiet, left-aligned block where the rows would have been
 * (S4). Styles in app/globals.css under "LEDGER SYSTEM" (.cr-empty).
 *
 *   <EmptyState
 *     title={t("investors.noMatch")}            // 15px/600 ink sentence naming the condition
 *     body={t("investors.noMatchSub")}          // optional, one 13px ink-3 sentence
 *     action={<button className="cr-btn cr-btn--text" onClick={clear}>Clear filters</button>}
 *   />
 *
 * Props
 * - title: required. Name the condition ("No investors match Seed and $1M+."),
 *   never an apology.
 * - body: optional single sentence.
 * - action: optional single text action (Clear filters, Retry, Upload), styled
 *   by the caller with .cr-btn--text or .cr-link. No signup links for
 *   signed-in viewers.
 * - Icon: accepted for backward compatibility and ignored. No icon tile, no
 *   drawer tag, no dashed box, no centring.
 *
 * Errors use the same shape with a Retry action. Server-safe: no hooks.
 */
export type EmptyStateProps = {
  /** Ignored. Kept so existing call sites compile unchanged. */
  Icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
};

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="cr-empty">
      <p className="cr-empty__title">{title}</p>
      {body && <p className="cr-empty__body">{body}</p>}
      {action && <div className="cr-empty__action">{action}</div>}
    </div>
  );
}
