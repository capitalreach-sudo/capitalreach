import type { ReactNode } from "react";

/**
 * PageHeader: the one page title (S5). Styles in app/globals.css under
 * "LEDGER SYSTEM".
 *
 *   <PageHeader title={t("nav.investors")} count={t("investors.ledger.count", { count: rows.length })} />
 *   <PageHeader title={company.name} meta={<span className="cr-chip">Live</span>}
 *     end={<Link href="/dashboard/startup/edit" className="cr-btn">Edit listing</Link>} />
 *
 * Props
 * - title: the H1. The navbar label for the route; the person or company
 *   name on dashboards. 28px/600, -0.02em, var(--font-serif), always roman.
 * - count: a fully worded, pluralised count ("2 investors"). Rendered inline
 *   on the H1 baseline in 15px ink-3 tabular figures. Never pass a bare
 *   number or a zero; omit it instead (S3).
 * - meta: other inline text or a status chip, after the count.
 * - end: actions at the inline end (a .cr-btn, a .cr-btn--text, a link).
 *   Keep it to two; labels never wrap.
 *
 * Geometry: 32px above, 24px below to the filter bar or first block. Count
 * and meta wrap under the H1 below 640px. No eyebrow, no lede.
 * Server-safe: no hooks.
 */
export type PageHeaderProps = {
  title: ReactNode;
  count?: string | null;
  meta?: ReactNode;
  end?: ReactNode;
  className?: string;
  /** id for the H1, e.g. to label a region with aria-labelledby. */
  id?: string;
};

function hasContent(node: ReactNode) {
  return node !== undefined && node !== null && node !== false && node !== "";
}

export function PageHeader({ title, count, meta, end, className, id }: PageHeaderProps) {
  const hasCount = typeof count === "string" && count.length > 0;
  const hasMeta = hasContent(meta);

  return (
    <div className={className ? `cr-page-header ${className}` : "cr-page-header"}>
      <div className="cr-page-header__main">
        <h1 id={id} className="cr-page-title">{title}</h1>
        {(hasCount || hasMeta) && (
          <div className="cr-page-meta">
            {hasCount && <span>{count}</span>}
            {hasCount && hasMeta && <span aria-hidden="true">·</span>}
            {hasMeta && <span>{meta}</span>}
          </div>
        )}
      </div>
      {hasContent(end) && <div className="cr-page-header__end">{end}</div>}
    </div>
  );
}
