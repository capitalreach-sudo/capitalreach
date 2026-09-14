"use client";

import Link from "next/link";
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useId,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Ledger: hairline-ruled rows instead of cards (S1). Styles live in
 * app/globals.css under "LEDGER SYSTEM"; this file only supplies structure
 * and semantics.
 *
 * Usage
 *
 *   <Section title="Watchlist" meta="3 saved" end={<button className="cr-btn cr-btn--text">Export CSV</button>}>
 *     <Ledger
 *       columns="minmax(0,1.2fr) minmax(0,1.4fr) auto"
 *       head={
 *         <LedgerHead>
 *           <LedgerCell>Investor</LedgerCell>
 *           <LedgerCell>Mandate</LedgerCell>
 *           <LedgerCell figure>Check size</LedgerCell>
 *         </LedgerHead>
 *       }
 *     >
 *       {rows.map((r) => (
 *         <LedgerRow key={r.id} href={`/investors/${r.slug}`} label={r.name}>
 *           <LedgerCell primary>
 *             <span className="cr-row-title">{r.name}</span>
 *             <span className="cr-row-sub">{r.meta}</span>
 *           </LedgerCell>
 *           <LedgerCell><span className="cr-row-sub">{r.mandate}</span></LedgerCell>
 *           <LedgerCell figure>{r.check ?? <span className="cr-absent">Not stated</span>}</LedgerCell>
 *         </LedgerRow>
 *       ))}
 *     </Ledger>
 *   </Section>
 *
 * Contract
 * - Ledger `columns` is the grid-template-columns used from md up. Give one
 *   track per cell, plus one more (usually `auto` or `2.75rem`) when rows
 *   carry `trailing`. Below md the grid is fixed: primary cell and first
 *   figure on line one, the trailing control after them, everything else
 *   stacked underneath in DOM order.
 * - Passing `head` makes the ledger an ARIA table (head row of
 *   columnheaders, rows of cells); without it the ledger is a <ul> of <li>.
 *   The head is hidden below md.
 * - Cells must be direct children of LedgerHead / LedgerRow (no fragments
 *   or wrappers), so the grid and the table roles line up.
 * - LedgerRow `href` + `label` makes the whole row one real <Link>. The
 *   anchor is an overlay rendered inside the `primary` cell; `label` is its
 *   accessible name and should be the row's visible name. Mark exactly one
 *   cell `primary` on linked rows. Default Link prefetch only: never pass
 *   prefetch, never fetch on hover, never replace the detail visit (views are
 *   counted on the detail page).
 * - `trailing` (bookmark, status select) renders in its own cell outside the
 *   anchor and above it. Any other interactive element inside a cell (an
 *   inner link) needs className "cr-row__raised" to sit above the overlay.
 * - Rows without `href` are plain rows: no hover wash, no press state.
 * - `busy` keeps the current rows on screen at 60% while a reload runs.
 * - Text helpers from globals.css: cr-row-title (15/600 ink), cr-row-sub
 *   (13/400 ink-3, one line with ellipsis), cr-absent ("Not stated" words),
 *   cr-ledger-foot (load more / export / hidden row under a ledger),
 *   cr-footnote (13px ink-3, 72ch).
 * - Never render a zero as a figure (S3); say it in words or omit the cell.
 */

type LedgerContextValue = { table: boolean };
const LedgerContext = createContext<LedgerContextValue>({ table: false });

type RowContextValue = { kind: "head" } | { kind: "row"; href?: string; label?: string };
const RowContext = createContext<RowContextValue | null>(null);

const SectionContext = createContext<string | null>(null);

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function hasContent(node: ReactNode) {
  return node !== undefined && node !== null && node !== false && node !== "";
}

export type LedgerProps = {
  /** grid-template-columns from md up, e.g. "minmax(0,1.2fr) minmax(0,1.4fr) auto". */
  columns?: string;
  /** A <LedgerHead>. Presence switches the ledger to table semantics. */
  head?: ReactNode;
  /** <LedgerRow> elements. */
  children?: ReactNode;
  /** True while results reload: rows stay visible at 60% opacity. */
  busy?: boolean;
  /** Accessible name. Inside a Section the section title is used by default. */
  "aria-label"?: string;
  className?: string;
  id?: string;
};

export function Ledger({ columns, head, children, busy, className, id, "aria-label": ariaLabel }: LedgerProps) {
  const sectionHeadingId = useContext(SectionContext);
  const table = hasContent(head);
  const style = columns ? ({ "--cr-ledger-cols": columns } as CSSProperties) : undefined;
  const labelProps = ariaLabel
    ? { "aria-label": ariaLabel }
    : sectionHeadingId
      ? { "aria-labelledby": sectionHeadingId }
      : {};

  if (table) {
    return (
      <LedgerContext.Provider value={{ table: true }}>
        <div
          role="table"
          id={id}
          className={cx("cr-ledger", className)}
          style={style}
          data-head=""
          aria-busy={busy || undefined}
          {...labelProps}
        >
          <div role="rowgroup">{head}</div>
          <div role="rowgroup">{children}</div>
        </div>
      </LedgerContext.Provider>
    );
  }

  return (
    <LedgerContext.Provider value={{ table: false }}>
      <ul
        role="list"
        id={id}
        className={cx("cr-ledger", className)}
        style={style}
        aria-busy={busy || undefined}
        {...labelProps}
      >
        {children}
      </ul>
    </LedgerContext.Provider>
  );
}

export type LedgerHeadProps = {
  /** One <LedgerCell> per column, matching the row cells. */
  children: ReactNode;
  /** Screen-reader name for the trailing column, when rows carry `trailing`. */
  trailingLabel?: string;
  className?: string;
};

export function LedgerHead({ children, trailingLabel, className }: LedgerHeadProps) {
  const { table } = useContext(LedgerContext);
  return (
    <RowContext.Provider value={{ kind: "head" }}>
      <div
        role={table ? "row" : undefined}
        aria-hidden={table ? undefined : true}
        className={cx("cr-colhead", className)}
      >
        {children}
        {trailingLabel !== undefined && (
          <div role={table ? "columnheader" : undefined} className="cr-cell cr-cell--trailing">
            <span className="sr-only">{trailingLabel}</span>
          </div>
        )}
      </div>
    </RowContext.Provider>
  );
}

type LedgerRowLink =
  | { /** Detail page this row opens. */ href: string; /** Accessible name of the row link: the row's visible name. */ label: string }
  | { href?: undefined; label?: undefined };

export type LedgerRowProps = LedgerRowLink & {
  /** One <LedgerCell> per column. */
  children: ReactNode;
  /** Control rendered in its own cell after the others, outside and above the link. */
  trailing?: ReactNode;
  className?: string;
  id?: string;
};

export function LedgerRow({ href, label, trailing, children, className, id }: LedgerRowProps) {
  const { table } = useContext(LedgerContext);
  const linked = typeof href === "string" && href.length > 0;
  const hasPrimary = Children.toArray(children).some(
    (child) => isValidElement<{ primary?: boolean }>(child) && child.props.primary === true,
  );
  const Tag = table ? "div" : "li";

  return (
    <RowContext.Provider value={{ kind: "row", href: linked ? href : undefined, label }}>
      <Tag
        role={table ? "row" : undefined}
        id={id}
        className={cx("cr-row", className)}
        data-link={linked ? "" : undefined}
      >
        {linked && !hasPrimary && <RowLink href={href} label={label ?? ""} />}
        {children}
        {hasContent(trailing) && (
          <div role={table ? "cell" : undefined} className="cr-cell cr-cell--trailing">
            {trailing}
          </div>
        )}
      </Tag>
    </RowContext.Provider>
  );
}

function RowLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="cr-row__link" aria-label={label} />;
}

export type LedgerCellProps = {
  /** The row's identity cell. Hosts the row link; first on line one below md. */
  primary?: boolean;
  /** Money or count: mono 15/500 ink, tabular, aligned to the inline end. */
  figure?: boolean;
  /** Text alignment for non-figure cells. */
  align?: "start" | "end";
  /** Drop this cell below md. */
  desktopOnly?: boolean;
  children?: ReactNode;
  className?: string;
};

export function LedgerCell({ primary, figure, align, desktopOnly, children, className }: LedgerCellProps) {
  const { table } = useContext(LedgerContext);
  const row = useContext(RowContext);
  const inHead = row?.kind === "head";
  const link = row?.kind === "row" && primary && row.href ? { href: row.href, label: row.label ?? "" } : null;

  return (
    <div
      role={table ? (inHead ? "columnheader" : "cell") : undefined}
      className={cx(
        "cr-cell",
        primary && "cr-cell--primary",
        figure && "cr-cell--figure",
        align === "end" && "cr-cell--end",
        desktopOnly && "cr-cell--desktop",
        className,
      )}
    >
      {link && <RowLink href={link.href} label={link.label} />}
      {children}
    </div>
  );
}

export type SectionProps = {
  /** Sentence-case h2, e.g. "Rounds raising". */
  title: ReactNode;
  /** Inline prose on the title baseline, 13px ink-3 (a count sentence, a total). */
  meta?: ReactNode;
  /** Actions at the inline end: text buttons or one link. */
  end?: ReactNode;
  /** The section renders nothing at all when this is empty. */
  children?: ReactNode;
  /** Anchor target, e.g. "round". Scroll margin clears the sticky navbar. */
  id?: string;
  className?: string;
};

/**
 * Section: one h2 head over its rows (S1, S5).
 *
 *   <Section id="round" title="Round" meta={`${committed} of ${target} committed`}>
 *     {rows.length > 0 && <Ledger>...</Ledger>}
 *   </Section>
 *
 * Renders null when `children` is empty (null, false, undefined or an empty
 * array), so a section appears only when it has something to show. Empty
 * detection looks at direct children only: a Ledger with zero rows still
 * counts as content, so pass the condition, not an empty wrapper. Adjacent
 * sections are 48px apart; the head sits 12px above the first row with one
 * dark rule (the column header's rule replaces it when the ledger has a head).
 */
export function Section({ title, meta, end, children, id, className }: SectionProps) {
  const autoId = useId();
  if (Children.toArray(children).length === 0) return null;
  const headingId = `${autoId}section-title`;

  return (
    <section id={id} className={cx("cr-section", className)} aria-labelledby={headingId}>
      <div className="cr-section-head">
        <h2 id={headingId} className="cr-section-title">{title}</h2>
        {hasContent(meta) && <div className="cr-section-meta">{meta}</div>}
        {hasContent(end) && <div className="cr-section-end">{end}</div>}
      </div>
      <SectionContext.Provider value={headingId}>{children}</SectionContext.Provider>
    </section>
  );
}
