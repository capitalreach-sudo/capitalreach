"use client";

import { Check, ChevronDown, ListFilter, Search, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Filter bar: one control per idea (S2). Styles in app/globals.css under
 * "LEDGER SYSTEM". URL sync, thresholds on row counts and the filtering
 * itself stay in the consumer; these components only render and report.
 *
 * Usage
 *
 *   <FilterBar
 *     search={<FilterSearch value={q} onChange={setQ} label={t("common.search")}
 *               placeholder="Search name, firm or sector" inputRef={searchRef} />}
 *     activeCount={stages.length + (check ? 1 : 0) + (leadsOnly ? 1 : 0)}
 *     onClear={clearFilters}
 *     sticky={total > 12}
 *     sheetDoneLabel={t("filters.applyCount", { count: results.length })}
 *     sort={<SortSelect value={sort} onChange={setSort} options={sortOptions} />}
 *   >
 *     <FilterMenu label="Stage" options={stageOptions} value={stages} onChange={setStages} />
 *     <FilterMenu label="Check size" multiple={false} options={checkOptions} value={check} onChange={setCheck} />
 *     <FilterToggle label="Leads rounds" pressed={leadsOnly} onChange={setLeadsOnly} />
 *   </FilterBar>
 *
 * Layout: from lg up, one row: search (grows) | menus and toggles | Clear |
 * sort at the inline end. Below lg: search plus a "Filters (n)" button that
 * opens FiltersSheet, which renders the same children and the sort as
 * inline option groups. Children therefore render twice (bar and sheet);
 * keep them pure and controlled.
 *
 * Geometry for skeletons: a 44px control row, 24px below the page header,
 * 16px above the list.
 *
 * Motion: menus scale and fade from their trigger and close back into it
 * (160ms); the sheet rises from the bottom and returns there (240ms). All
 * transitions are CSS on transform and opacity, so they reverse cleanly when
 * interrupted. Selections apply instantly; only free-text search may debounce
 * (150ms at most, in the consumer).
 */

type Surface = "bar" | "sheet";
const SurfaceContext = createContext<Surface>("bar");

type Vars = Record<string, string | number>;

function useTf() {
  const { t } = useTranslation();
  const tf = useCallback(
    (key: string, fallback: string, vars?: Vars) => {
      const value = t(key, vars);
      if (value !== key) return value;
      if (!vars) return fallback;
      return fallback.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
    },
    [t],
  );
  return { t, tf };
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function hasContent(node: ReactNode) {
  return node !== undefined && node !== null && node !== false && node !== "";
}

/* ─────────────────────────────────────────────────────────────────────────
   FilterBar
   ───────────────────────────────────────────────────────────────────────── */

export type FilterBarProps = {
  /** The search field, normally <FilterSearch>. Always visible. */
  search: ReactNode;
  /** FilterMenu, FilterToggle and FilterPopover controls, at most four menus. */
  children?: ReactNode;
  /** A <SortSelect>. Sits at the inline end on lg, last in the sheet. */
  sort?: ReactNode;
  /** Number of active filter selections (not the query, not the sort). Drives Clear and "Filters (n)". */
  activeCount: number;
  /** Clears every filter. The single Clear shows only while activeCount > 0. */
  onClear?: () => void;
  /** Pass true only when the list total is above 12 rows. */
  sticky?: boolean;
  /** Sheet heading. Defaults to "Filters". */
  sheetTitle?: string;
  /** Sheet close button label, e.g. t("filters.applyCount", { count }). Defaults to "Done". */
  sheetDoneLabel?: string;
  "aria-label"?: string;
  className?: string;
};

export function FilterBar({
  search,
  children,
  sort,
  activeCount,
  onClear,
  sticky = false,
  sheetTitle,
  sheetDoneLabel,
  "aria-label": ariaLabel,
  className,
}: FilterBarProps) {
  const { t, tf } = useTf();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasControls = hasContent(children) || hasContent(sort);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // The scroll-edge fade shows only once rows actually pass beneath the bar.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const bar = barRef.current;
    if (!sticky || !sentinel || !bar || typeof IntersectionObserver === "undefined") {
      setStuck(false);
      return;
    }
    const top = parseFloat(getComputedStyle(bar).top) || 56;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const line = entry.rootBounds ? entry.rootBounds.top : top + 1;
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top < line);
      },
      { rootMargin: `-${top + 1}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sticky]);

  const clear = onClear ? <ClearButton onClick={onClear} active={activeCount > 0} /> : null;

  return (
    <>
      {sticky && <div ref={sentinelRef} aria-hidden="true" />}
      <div
        ref={barRef}
        role="search"
        aria-label={ariaLabel}
        className={cx("cr-filterbar", className)}
        data-sticky={sticky ? "true" : undefined}
        data-stuck={sticky && stuck ? "true" : undefined}
      >
        <div className="cr-filterbar__row">
          <div className="cr-filterbar__search">{search}</div>
          {hasControls && (
            <div className="cr-filterbar__controls">
              <SurfaceContext.Provider value="bar">
                {children}
                {clear}
                {sort}
              </SurfaceContext.Provider>
            </div>
          )}
          {hasControls && (
            <button
              type="button"
              className="cr-menu-btn cr-filterbar__sheet-btn"
              data-active={activeCount > 0 ? "true" : undefined}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen(true)}
            >
              <ListFilter size={16} aria-hidden="true" />
              <span className="cr-menu-btn__label">
                {activeCount > 0
                  ? tf("common.ledger.filtersCount", "Filters ({count})", { count: activeCount })
                  : t("filters.title")}
              </span>
            </button>
          )}
        </div>
      </div>
      {hasControls && (
        <FiltersSheet
          open={sheetOpen}
          onClose={closeSheet}
          title={sheetTitle}
          onClear={onClear}
          clearActive={activeCount > 0}
          doneLabel={sheetDoneLabel}
        >
          {children}
          {sort}
        </FiltersSheet>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FilterSearch
   ───────────────────────────────────────────────────────────────────────── */

export type FilterSearchProps = {
  value: string;
  onChange: (next: string) => void;
  /** Accessible name, e.g. t("common.search"). */
  label: string;
  placeholder?: string;
  /** For the consumer's "/" shortcut. */
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  id?: string;
  name?: string;
};

/** 44px search field with a leading search icon and a clear-query button while it has text. */
export function FilterSearch({ value, onChange, label, placeholder, inputRef, onKeyDown, id, name }: FilterSearchProps) {
  const { tf } = useTf();
  const internalRef = useRef<HTMLInputElement | null>(null);
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      internalRef.current = node;
      if (typeof inputRef === "function") inputRef(node);
      else if (inputRef) (inputRef as MutableRefObject<HTMLInputElement | null>).current = node;
    },
    [inputRef],
  );

  return (
    <div className="cr-search">
      <Search size={16} aria-hidden="true" className="cr-search__icon" />
      <input
        ref={setRef}
        id={id}
        name={name}
        type="search"
        className="cr-input"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {value.length > 0 && (
        <button
          type="button"
          className="cr-search__clear"
          aria-label={tf("common.ledger.clearSearch", "Clear search")}
          onClick={() => {
            onChange("");
            internalRef.current?.focus();
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FilterPopover: the shared menu primitive
   ───────────────────────────────────────────────────────────────────────── */

export type FilterPopoverApi = {
  /** Closes the popover and returns focus to its trigger. A no-op in the sheet. */
  close: () => void;
  surface: Surface;
};

export type FilterPopoverProps = {
  /** Trigger text. Carry the selection in it ("Stage: Seed"). One line, never wraps. */
  label: string;
  /** Marks the trigger as holding a selection (ink-3 border, 500 weight). */
  active?: boolean;
  /** Which trigger edge the menu hangs from. Flips automatically when it would leave the viewport. */
  align?: "start" | "end";
  /** Group heading in the sheet. Defaults to `label`. */
  sheetLabel?: string;
  children: ReactNode | ((api: FilterPopoverApi) => ReactNode);
  className?: string;
};

/**
 * A disclosure button with a floating panel in the bar, and a titled group
 * in the sheet. FilterMenu and SortSelect are built on it; use it directly
 * only for menus that are not a plain option list (the /startups "Saved"
 * menu). No scrim, non-blocking: closes on Escape, outside press, or focus
 * leaving it.
 */
export function FilterPopover({ label, active, align = "start", sheetLabel, children, className }: FilterPopoverProps) {
  const surface = useContext(SurfaceContext);
  const [open, setOpen] = useState(false);
  const [resolvedAlign, setResolvedAlign] = useState<"start" | "end">(align);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
    if (anchorRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  if (surface === "sheet") {
    const content = typeof children === "function" ? children({ close: () => {}, surface }) : children;
    return (
      <fieldset className={cx("cr-group", className)}>
        <legend className="cr-group__legend">{sheetLabel ?? label}</legend>
        {content}
      </fieldset>
    );
  }

  // Chooses the hanging edge before opening, from the trigger's position and
  // the panel's laid-out width (the closed panel is hidden, not removed).
  const resolveAlign = () => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return align;
    const rtl = getComputedStyle(anchor).direction === "rtl";
    const rect = anchor.getBoundingClientRect();
    const width = menu.offsetWidth;
    const viewport = document.documentElement.clientWidth;
    const gutter = 8;
    const startOverflows = rtl ? rect.right - width < gutter : rect.left + width > viewport - gutter;
    const endOverflows = rtl ? rect.left + width > viewport - gutter : rect.right - width < gutter;
    if (align === "start") return startOverflows && !endOverflows ? "end" : "start";
    return endOverflows && !startOverflows ? "start" : "end";
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setResolvedAlign(resolveAlign());
    setOpen(true);
  };

  const focusFirstOption = () => {
    const menu = menuRef.current;
    if (!menu) return;
    const target =
      menu.querySelector<HTMLElement>("input:checked") ??
      menu.querySelector<HTMLElement>("input, button, a[href], select, textarea, [tabindex]:not([tabindex='-1'])");
    target?.focus();
  };

  const content = typeof children === "function" ? children({ close, surface }) : children;

  return (
    <div
      ref={anchorRef}
      className={cx("cr-popover-anchor", className)}
      onBlur={(e) => {
        // A null relatedTarget is a press on something unfocusable (Safari
        // does not focus checkboxes on click); the pointerdown listener owns that case.
        const next = e.relatedTarget as Node | null;
        if (open && next && !e.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="cr-menu-btn"
        aria-expanded={open}
        aria-controls={menuId}
        data-active={active ? "true" : undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) {
              setResolvedAlign(resolveAlign());
              setOpen(true);
            }
            // The panel is laid out while hidden, so it can take focus on the next frame.
            window.requestAnimationFrame(focusFirstOption);
          }
        }}
      >
        <span className="cr-menu-btn__label">{label}</span>
        <ChevronDown size={16} aria-hidden="true" className="cr-menu-btn__chevron" />
      </button>
      <div
        ref={menuRef}
        id={menuId}
        role="group"
        aria-label={sheetLabel ?? label}
        className="cr-menu"
        data-open={open ? "true" : "false"}
        data-align={resolvedAlign}
      >
        {content}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FilterMenu
   ───────────────────────────────────────────────────────────────────────── */

export type FilterOption<V extends string = string> = {
  value: V;
  label: string;
  /**
   * Rows in the loaded, unfiltered set carrying this value. An option with
   * count 0 is hidden (unless selected). Omit to always show the option.
   */
  count?: number;
};

type FilterMenuBaseProps<V extends string> = {
  /** Sentence-case dimension name: "Stage", "Check size", "Sector & region". */
  label: string;
  options: ReadonlyArray<FilterOption<V>>;
  align?: "start" | "end";
  className?: string;
};

export type FilterMenuProps<V extends string = string> = FilterMenuBaseProps<V> &
  (
    | { multiple?: true; value: ReadonlyArray<V>; onChange: (next: V[]) => void }
    | { multiple: false; value: V | null; onChange: (next: V | null) => void }
  );

/**
 * A single- or multi-select filter. The trigger label carries the selection
 * ("Stage", "Stage: Seed", "Stage: Seed +1"). Renders nothing when fewer than
 * two options survive the zero-row rule and nothing is selected, so a
 * filter only appears when it can split the loaded rows. Consumers still own
 * the secondary-dimension threshold (10+ rows). Single-select adds an "Any"
 * option and closes after a pointer selection; multi-select stays open.
 */
export function FilterMenu<V extends string = string>(props: FilterMenuProps<V>) {
  const { label, options, align, className } = props;
  const { tf } = useTf();
  const groupName = useId();
  const pointerSelect = useRef(false);
  const multiple = props.multiple !== false;
  const selected: V[] = props.multiple === false ? (props.value === null ? [] : [props.value]) : [...props.value];
  const visible = options.filter((o) => o.count !== 0 || selected.includes(o.value));

  if (visible.length < 2 && selected.length === 0) return null;

  const firstLabel = options.find((o) => o.value === selected[0])?.label ?? selected[0];
  let triggerLabel = label;
  if (selected.length > 0) {
    triggerLabel = tf("common.ledger.menuSelection", "{label}: {value}", { label, value: String(firstLabel) });
    if (selected.length > 1) {
      triggerLabel = `${triggerLabel} ${tf("common.ledger.moreSelected", "+{count}", { count: selected.length - 1 })}`;
    }
  }

  const markPointer = () => {
    pointerSelect.current = true;
  };

  const choose = (value: V | null, close: () => void) => {
    if (props.multiple === false) {
      props.onChange(value);
      if (pointerSelect.current) close();
    } else if (value !== null) {
      const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
      props.onChange(next);
    }
    pointerSelect.current = false;
  };

  return (
    <FilterPopover label={triggerLabel} sheetLabel={label} active={selected.length > 0} align={align} className={className}>
      {({ close }) => (
        <>
          {!multiple && (
            <label className="cr-option" onPointerDown={markPointer}>
              <input
                type="radio"
                name={groupName}
                checked={selected.length === 0}
                onChange={() => choose(null, close)}
                onKeyDown={() => { pointerSelect.current = false; }}
              />
              <span className="cr-option__label">{tf("common.ledger.any", "Any")}</span>
            </label>
          )}
          {visible.map((option) => (
            <label key={option.value} className="cr-option" onPointerDown={markPointer}>
              <input
                type={multiple ? "checkbox" : "radio"}
                name={groupName}
                value={option.value}
                checked={selected.includes(option.value)}
                onChange={() => choose(option.value, close)}
                onKeyDown={() => { pointerSelect.current = false; }}
              />
              <span className="cr-option__label">{option.label}</span>
            </label>
          ))}
        </>
      )}
    </FilterPopover>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FilterToggle
   ───────────────────────────────────────────────────────────────────────── */

export type FilterToggleProps = {
  /** What the filter keeps: "Leads rounds". */
  label: string;
  pressed: boolean;
  onChange: (next: boolean) => void;
  className?: string;
};

/**
 * An on/off filter. A pressed chip in the bar (aria-pressed, a filled ink
 * box when on, so state never rests on weight alone); a checkbox row in the
 * sheet. Render it only when rows differ on this attribute.
 */
export function FilterToggle({ label, pressed, onChange, className }: FilterToggleProps) {
  const surface = useContext(SurfaceContext);

  if (surface === "sheet") {
    return (
      <div className={cx("cr-group", className)}>
        <label className="cr-option">
          <input type="checkbox" checked={pressed} onChange={(e) => onChange(e.target.checked)} />
          <span className="cr-option__label">{label}</span>
        </label>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cx("cr-menu-btn", className)}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
    >
      <span className="cr-check-glyph" aria-hidden="true">
        {pressed && <Check size={10} strokeWidth={3} />}
      </span>
      <span className="cr-menu-btn__label">{label}</span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SortSelect
   ───────────────────────────────────────────────────────────────────────── */

export type SortOption<V extends string = string> = { value: V; label: string };

export type SortSelectProps<V extends string = string> = {
  options: ReadonlyArray<SortOption<V>>;
  value: V;
  onChange: (next: V) => void;
  /** Group heading in the sheet. Defaults to t("common.sort"). */
  label?: string;
  /** Defaults to "end": the sort lives at the bar's inline end. */
  align?: "start" | "end";
  className?: string;
};

/**
 * The one sort control. Trigger reads "Sort: Newest"; the panel is a radio
 * list that applies instantly and closes after a pointer choice. Renders
 * nothing with fewer than two options. Only offer sorts the loaded data can
 * actually order.
 */
export function SortSelect<V extends string = string>({ options, value, onChange, label, align = "end", className }: SortSelectProps<V>) {
  const { t, tf } = useTf();
  const groupName = useId();
  const pointerSelect = useRef(false);

  if (options.length < 2) return null;

  const current = options.find((o) => o.value === value)?.label ?? options[0].label;
  const heading = label ?? t("common.sort");

  return (
    <FilterPopover
      label={tf("common.ledger.sortSelection", "Sort: {value}", { value: current })}
      sheetLabel={heading}
      align={align}
      className={className}
    >
      {({ close }) =>
        options.map((option) => (
          <label key={option.value} className="cr-option" onPointerDown={() => { pointerSelect.current = true; }}>
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={option.value === value}
              onChange={() => {
                onChange(option.value);
                if (pointerSelect.current) close();
                pointerSelect.current = false;
              }}
              onKeyDown={() => { pointerSelect.current = false; }}
            />
            <span className="cr-option__label">{option.label}</span>
          </label>
        ))
      }
    </FilterPopover>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ClearButton
   ───────────────────────────────────────────────────────────────────────── */

export type ClearButtonProps = {
  onClick: () => void;
  /** Renders nothing when false. Pass whether any filter is active. */
  active?: boolean;
  /** Label override. Defaults to "Clear". */
  children?: ReactNode;
  className?: string;
};

/** The single quiet Clear text button (44px), shown only while something is active. */
export function ClearButton({ onClick, active = true, children, className }: ClearButtonProps) {
  const { tf } = useTf();
  if (!active) return null;
  return (
    <button type="button" className={cx("cr-btn cr-btn--text", className)} onClick={onClick}>
      {children ?? tf("common.ledger.clear", "Clear")}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FiltersSheet
   ───────────────────────────────────────────────────────────────────────── */

export type FiltersSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Defaults to t("filters.title"). */
  title?: string;
  /** Controls rendered as inline groups (FilterMenu, FilterToggle, SortSelect, FilterPopover). */
  children: ReactNode;
  /** When given, a Clear text button sits in the sheet head. */
  onClear?: () => void;
  clearActive?: boolean;
  /** The primary close button's label. Defaults to t("common.done"). */
  doneLabel?: string;
};

/**
 * The one bottom sheet below lg. FilterBar mounts it for you; mount it
 * yourself only for a bar you build by hand. Modal: scrim, focus moves in
 * and is kept in, Escape / scrim / the done button close it, focus returns
 * to what opened it, page scroll is locked while open. It closes itself if
 * the viewport grows to lg. Portalled to <body> so sticky or blurred
 * ancestors cannot trap its fixed positioning. It stops above the mobile tab
 * bar. No drag gesture.
 */
export function FiltersSheet({ open, onClose, title, children, onClear, clearActive = true, doneLabel }: FiltersSheetProps) {
  const { t } = useTf();
  const [mounted, setMounted] = useState(false);
  const [everOpened, setEverOpened] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  if (open && !everOpened) setEverOpened(true);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => {
      if (wide.matches) onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    wide.addEventListener("change", onWide);

    return () => {
      window.cancelAnimationFrame(frame);
      root.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", onWide);
      previous?.focus();
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div className="cr-sheet" data-open={open ? "true" : "false"} aria-hidden={open ? undefined : true}>
      <div className="cr-sheet__scrim" aria-hidden="true" onClick={onClose} />
      {/* Focus sentinels keep Tab inside the dialog in both directions. */}
      {open && <span tabIndex={0} className="sr-only" onFocus={() => doneRef.current?.focus()} />}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-focus-self=""
        className="cr-sheet__panel"
      >
        <div className="cr-sheet__head">
          <h2 id={titleId} className="cr-sheet__title">{title ?? t("filters.title")}</h2>
          {onClear && <ClearButton onClick={onClear} active={clearActive} />}
        </div>
        <div className="cr-sheet__body">
          <SurfaceContext.Provider value="sheet">{everOpened ? children : null}</SurfaceContext.Provider>
        </div>
        <div className="cr-sheet__foot">
          <button ref={doneRef} type="button" className="cr-btn cr-btn--primary" onClick={onClose}>
            {doneLabel ?? t("common.done")}
          </button>
        </div>
      </div>
      {open && <span tabIndex={0} className="sr-only" onFocus={() => panelRef.current?.focus()} />}
    </div>,
    document.body,
  );
}
