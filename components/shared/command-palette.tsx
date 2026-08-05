"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Rocket, Users, Brain, Tag, BarChart3, Handshake,
  LayoutDashboard, MessageSquare, Bell, Settings, CornerDownLeft,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useProfile } from "@/hooks/useProfile";

/**
 * ⌘K / Ctrl-K palette: one keystroke to any listing, any investor, or any page.
 *
 * The navbar already has a search box, but it only searches -- it cannot take
 * you to Settings, and on a laptop it costs a reach for the mouse. This is the
 * keyboard path through the whole product, and it is deliberately the *only*
 * component that knows the full route map, so adding a destination here adds it
 * everywhere at once.
 *
 * "/" is already bound by the directory pages' own search boxes, so this binds
 * ⌘K/Ctrl-K exclusively and never swallows a plain keystroke while the user is
 * typing into a field.
 */
type Hit = { kind: "startup" | "investor"; slug: string; name: string; sub?: string | null };
type Row =
  | { type: "hit"; hit: Hit }
  | { type: "route"; href: string; label: string; Icon: typeof Search };

export function CommandPalette() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const dashboardPath =
    profile?.role === "startup" ? "/dashboard/startup"
    : profile?.role === "admin" ? "/admin"
    : "/dashboard/investor";

  const routes = useMemo<Row[]>(() => {
    const pub: Row[] = [
      { type: "route", href: "/startups", label: t("nav.startups"), Icon: Rocket },
      { type: "route", href: "/investors", label: t("nav.investors"), Icon: Users },
      { type: "route", href: "/ai", label: t("nav.aiTools"), Icon: Brain },
      { type: "route", href: "/pricing", label: t("nav.pricing"), Icon: Tag },
      { type: "route", href: "/data", label: t("nav.data"), Icon: BarChart3 },
    ];
    if (!profile) return pub;
    return [
      { type: "route", href: dashboardPath, label: t("nav.dashboard"), Icon: LayoutDashboard },
      { type: "route", href: "/deals", label: t("nav.deals"), Icon: Handshake },
      { type: "route", href: "/dashboard/messages", label: t("nav.messages"), Icon: MessageSquare },
      { type: "route", href: "/dashboard/notifications", label: t("notifications.title"), Icon: Bell },
      ...pub,
      { type: "route", href: "/dashboard/settings", label: t("nav.settings"), Icon: Settings },
    ];
  }, [profile, dashboardPath, t]);

  // ── Open / close ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) { setQ(""); setHits([]); setActive(0); return; }
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => { document.body.style.overflow = ""; window.clearTimeout(id); };
  }, [open]);

  // ── Search ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (!res.ok) return;
        const data = await res.json();
        setHits([
          ...(data.startups ?? []).map((s: { slug: string; name: string; tagline?: string }) => ({
            kind: "startup" as const, slug: s.slug, name: s.name, sub: s.tagline,
          })),
          ...(data.investors ?? []).map((i: { slug: string; name: string; firm?: string | null }) => ({
            kind: "investor" as const, slug: i.slug, name: i.name, sub: i.firm,
          })),
        ]);
      } catch { /* aborted or offline -- the previous hits stay on screen */ }
    }, 160);
    return () => { ctl.abort(); window.clearTimeout(id); };
  }, [q]);

  // Routes are filtered locally; hits come from the server. When the box is
  // empty the palette is a pure jump-list, which is its most common use.
  const rows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    const matched = term
      ? routes.filter((r) => r.type === "route" && r.label.toLowerCase().includes(term))
      : routes;
    return [...hits.map((hit) => ({ type: "hit" as const, hit })), ...matched];
  }, [hits, routes, q]);

  useEffect(() => { setActive(0); }, [rows.length]);

  const go = useCallback((row: Row) => {
    setOpen(false);
    router.push(row.type === "hit"
      ? `/${row.hit.kind === "startup" ? "startups" : "investors"}/${row.hit.slug}`
      : row.href);
  }, [router]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && rows[active]) { e.preventDefault(); go(rows[active]); }
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center"
      style={{ background: "rgba(26,22,18,0.45)", padding: "10vh 16px 16px" }}
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "560px",
          background: "var(--cr-paper-2)",
          border: "1px solid var(--cr-rule-dark)",
          borderRadius: "10px",
          boxShadow: "0 24px 64px rgba(26,22,18,0.28)",
          overflow: "hidden",
        }}
      >
        <div className="flex items-center gap-2" style={{ padding: "0 14px", borderBottom: "1px solid var(--cr-rule)" }}>
          <Search size={16} style={{ color: "var(--cr-ink-4)", flexShrink: 0 }} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            style={{
              flex: 1, height: "48px", border: "none", background: "transparent", outline: "none",
              fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "var(--cr-ink)",
            }}
          />
          <kbd
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)",
              border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "2px 5px",
            }}
          >
            ESC
          </kbd>
        </div>

        <div ref={listRef} role="listbox" aria-label={t("palette.results")} style={{ maxHeight: "56vh", overflowY: "auto", padding: "6px" }}>
          {rows.length === 0 && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", padding: "22px 12px", textAlign: "center" }}>
              {q.trim().length >= 2 ? t("palette.noResults", { q: q.trim() }) : t("palette.hint")}
            </p>
          )}

          {rows.map((row, i) => {
            const isActive = i === active;
            const key = row.type === "hit" ? `${row.hit.kind}-${row.hit.slug}` : row.href;
            const label = row.type === "hit" ? row.hit.name : row.label;
            const sub = row.type === "hit" ? row.hit.sub : null;
            const Icon = row.type === "hit" ? (row.hit.kind === "startup" ? Rocket : Users) : row.Icon;
            return (
              <button
                key={key}
                data-active={isActive}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(row)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "10px",
                  minHeight: "44px", padding: "8px 10px", borderRadius: "6px",
                  border: "none", cursor: "pointer", textAlign: "start",
                  background: isActive ? "var(--cr-copper-bg)" : "transparent",
                }}
              >
                <Icon size={15} style={{ color: isActive ? "var(--cr-copper)" : "var(--cr-ink-4)", flexShrink: 0 }} aria-hidden />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{
                    display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: isActive ? 600 : 400,
                    fontSize: "13px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {label}
                  </span>
                  {sub && (
                    <span style={{
                      display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px",
                      color: "var(--cr-ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {sub}
                    </span>
                  )}
                </span>
                {isActive && <CornerDownLeft size={13} style={{ color: "var(--cr-ink-4)", flexShrink: 0 }} aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
