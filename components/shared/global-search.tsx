"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, Briefcase } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

// When only investors matched, "see all" should land on the investors
// directory (which now also reads ?q=), not dump the query on /startups.
function seeAllHref(q: string, r: Results | null): string {
  const dir = r && r.startups.length === 0 && r.investors.length > 0 ? "/investors" : "/startups";
  return `${dir}?q=${encodeURIComponent(q.trim())}`;
}

interface Results {
  startups: Array<{ name: string; slug: string; tagline: string | null; industry: string | null }>;
  investors: Array<{ slug: string; name: string; firm: string | null; type: string | null }>;
}

/**
 * One box that reaches both directories. Until now finding anything meant
 * knowing whether it was a startup or an investor and going to that page's
 * own search first.
 *
 * An icon that expands into an input, because the navbar has no room for a
 * permanent field next to six nav links. Debounced 250ms; Escape closes;
 * Enter opens the first hit.
 */
export function GlobalSearch() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else { setQ(""); setResults(null); }
  }, [open]);

  // Close on outside click, same convention as the bell.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Debounced fetch. The trailing request is the only one whose result is
  // applied -- a stale slow response must not overwrite a newer one.
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const ctl = new AbortController();
    const tmr = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (res.ok) setResults(await res.json());
      } catch { /* aborted or offline -- keep whatever is shown */ }
    }, 250);
    return () => { clearTimeout(tmr); ctl.abort(); };
  }, [q]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  // Ordered hrefs for keyboard navigation: startups, then investors, then the
  // see-all row. `active` indexes into this list; -1 means nothing chosen and
  // Enter falls back to the first entry.
  const hrefs: string[] = [
    ...(results?.startups ?? []).map((s) => `/startups/${s.slug}`),
    ...(results?.investors ?? []).map((i) => `/investors/${i.slug}`),
    ...(q.trim().length >= 2 ? [seeAllHref(q, results)] : []),
  ];
  const [active, setActive] = useState(-1);
  useEffect(() => { setActive(-1); }, [results]);
  const first = hrefs[0] ?? null;

  const hasHits = !!results && (results.startups.length > 0 || results.investors.length > 0);

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "8px", width: "100%",
    padding: "8px 12px", background: "none", border: "none", cursor: "pointer",
    textAlign: "left", fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div ref={rootRef} style={{ position: "relative", lineHeight: 1 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("search.aria")}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#9C8E82", padding: 0, display: "flex", transition: "color 150ms ease" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#3D3630")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#9C8E82")}
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "26px", width: "300px", maxWidth: "calc(100vw - 32px)", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "0 6px 24px rgba(26,22,18,0.12)", zIndex: 100 }}>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hrefs.length - 1)); }
              if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
              if (e.key === "Enter") {
                const target = active >= 0 ? hrefs[active] : first;
                if (target) go(target);
              }
            }}
            placeholder={t("search.placeholder")}
            style={{ width: "100%", height: "38px", padding: "0 12px", border: "none", borderBottom: hasHits || (q.trim().length >= 2 && results) ? "1px solid var(--cr-rule)" : "none", background: "transparent", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)", boxSizing: "border-box" }}
          />

          {results && !hasHits && q.trim().length >= 2 && (
            <p style={{ padding: "14px 12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
              {t("search.noResults")}
            </p>
          )}

          {hasHits && (
            <div style={{ maxHeight: "320px", overflowY: "auto", paddingBottom: "4px" }}>
              {results!.startups.length > 0 && (
                <>
                  <p style={{ padding: "8px 12px 3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {t("search.startups")}
                  </p>
                  {results!.startups.map((s, idx) => (
                    <button key={s.slug} type="button"
                      style={{ ...rowStyle, background: active === idx ? "var(--cr-copper-bg)" : "none" }}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(`/startups/${s.slug}`)}>
                      <Building2 style={{ width: 13, height: 13, color: "var(--cr-copper)", flexShrink: 0 }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        {s.tagline && <span style={{ display: "block", fontSize: "11px", fontWeight: 300, color: "var(--cr-ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tagline}</span>}
                      </span>
                    </button>
                  ))}
                </>
              )}
              {results!.investors.length > 0 && (
                <>
                  <p style={{ padding: "8px 12px 3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {t("search.investors")}
                  </p>
                  {results!.investors.map((i, idx) => {
                    const gi = results!.startups.length + idx;
                    return (
                    <button key={i.slug} type="button"
                      style={{ ...rowStyle, background: active === gi ? "var(--cr-copper-bg)" : "none" }}
                      onMouseEnter={() => setActive(gi)}
                      onClick={() => go(`/investors/${i.slug}`)}>
                      <Briefcase style={{ width: 13, height: 13, color: "var(--cr-ink-3)", flexShrink: 0 }} />
                      <span style={{ display: "block", minWidth: 0, fontSize: "13px", fontWeight: 500, color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</span>
                    </button>
                  );})}
                </>
              )}

              {/* The dropdown caps at five per side; the full directory search
                  is one keypress further. /startups already reads ?q=. */}
              <button type="button"
                style={{ ...rowStyle, borderTop: "1px solid var(--cr-rule)", background: active === hrefs.length - 1 ? "var(--cr-copper-bg)" : "none", justifyContent: "center" }}
                onMouseEnter={() => setActive(hrefs.length - 1)}
                onClick={() => go(seeAllHref(q, results))}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--cr-copper)" }}>{t("search.seeAll", { q: q.trim() })}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
