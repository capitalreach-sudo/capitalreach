"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, ArrowUp } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";

type Turn = { role: "user" | "assistant"; content: string };

/**
 * Ask about this page.
 *
 * The panel sends WHERE you are, not what is on your screen — the server
 * assembles the context from the database against your own permissions. That
 * is a deliberate constraint rather than an implementation detail: if the
 * browser supplied the text, the assistant would answer questions about
 * anything anyone pasted, on our account, and reading out figures the viewer
 * has not paid to see would be one prompt away.
 *
 * Hidden entirely on signed-in working surfaces (dashboard, deals, messages,
 * admin): those pages are for doing things, and a floating button over a
 * kanban board is in the way.
 */
const HIDDEN_ON = ["/dashboard", "/deals", "/admin", "/auth", "/onboarding"];

export function SiteAssistant() {
  const { t } = useTranslation();
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEscapeKey(open, () => setOpen(false));

  // Which page this is, in the shape the API expects. Derived from the route,
  // so it cannot claim to be a page the visitor is not on.
  const page = useMemo(() => {
    const listing = pathname.match(/^\/startups\/([^/]+)$/);
    if (listing) return { kind: "listing", slug: decodeURIComponent(listing[1]) };
    const investor = pathname.match(/^\/investors\/([^/]+)$/);
    if (investor) return { kind: "investor", slug: decodeURIComponent(investor[1]) };
    if (pathname === "/startups") return { kind: "browse" };
    if (pathname === "/data") return { kind: "data" };
    if (pathname === "/pricing") return { kind: "pricing" };
    return { kind: "other", path: pathname };
  }, [pathname]);

  // A new page is a new subject. Carrying the last page's answers into this
  // one is how an assistant starts confidently describing the wrong company.
  useEffect(() => { setTurns([]); }, [pathname]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, busy]);

  if (HIDDEN_ON.some(p => pathname.startsWith(p)) || unavailable) return null;

  async function ask() {
    const question = draft.trim();
    if (!question || busy) return;
    setDraft("");
    setTurns(prev => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, page, history: turns }),
      });

      if (res.status === 503) { setUnavailable(true); return; }
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setTurns(prev => replaceLast(prev, j.error || t("assistant.failed")));
        return;
      }

      // Streamed so the first words arrive in about a second rather than the
      // whole answer arriving in ten.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setTurns(prev => replaceLast(prev, acc));
      }
    } catch {
      setTurns(prev => replaceLast(prev, t("assistant.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label={t("assistant.open")}
          style={{
            position: "fixed", right: "18px", bottom: "84px", zIndex: 45,
            display: "inline-flex", alignItems: "center", gap: "7px",
            background: "var(--cr-ink)", color: "var(--cr-paper)",
            border: "none", borderRadius: "999px", padding: "10px 16px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12.5px",
            cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
          }}>
          <Sparkles style={{ width: 14, height: 14 }} />
          {t("assistant.open")}
        </button>
      )}

      {open && (
        <div role="dialog" aria-label={t("assistant.title")}
          style={{
            position: "fixed", right: "18px", bottom: "84px", zIndex: 45,
            width: "min(380px, calc(100vw - 36px))", maxHeight: "min(560px, calc(100vh - 140px))",
            display: "flex", flexDirection: "column",
            background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
            borderRadius: "8px", boxShadow: "0 12px 40px rgba(0,0,0,0.20)", overflow: "hidden",
          }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: "1px solid var(--cr-rule)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
              <Sparkles style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
              {t("assistant.title")}
            </span>
            <button onClick={() => setOpen(false)} aria-label={t("common.close")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", padding: 2 }}>
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 14px", minHeight: 120 }}>
            {turns.length === 0 ? (
              <div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12.5px", color: "var(--cr-ink-3)", lineHeight: 1.55 }}>
                  {t("assistant.intro")}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {[t("assistant.suggest1"), t("assistant.suggest2"), t("assistant.suggest3")].map(q => (
                    <button key={q} onClick={() => setDraft(q)}
                      style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "999px", padding: "5px 10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "11.5px", color: "var(--cr-ink-3)" }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cr-ink-4)", marginBottom: 3 }}>
                    {turn.role === "user" ? t("assistant.you") : t("assistant.title")}
                  </p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {turn.content || (busy && i === turns.length - 1 ? t("assistant.thinking") : "")}
                  </p>
                </div>
              ))
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--cr-rule)", padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value.slice(0, 1000))}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}
                rows={1}
                placeholder={t("assistant.placeholder")}
                style={{ flex: 1, resize: "none", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "6px", padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)", outline: "none", maxHeight: 90 }}
              />
              <button onClick={ask} disabled={busy || !draft.trim()} aria-label={t("assistant.send")}
                style={{ background: "var(--cr-ink)", color: "var(--cr-paper)", border: "none", borderRadius: "6px", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: busy || !draft.trim() ? "not-allowed" : "pointer", opacity: busy || !draft.trim() ? 0.4 : 1, flexShrink: 0 }}>
                <ArrowUp style={{ width: 15, height: 15 }} />
              </button>
            </div>
            {/* Said once, permanently, under the box people type into. */}
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", color: "var(--cr-ink-4)", marginTop: 7, lineHeight: 1.45 }}>
              {t("assistant.disclaimer")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/** The assistant turn is appended empty and filled as the stream arrives. */
function replaceLast(turns: Turn[], content: string): Turn[] {
  if (turns.length === 0) return turns;
  const next = turns.slice();
  next[next.length - 1] = { role: "assistant", content };
  return next;
}
