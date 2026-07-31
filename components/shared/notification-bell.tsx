"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Unread count and a dropdown of recent notifications.
 *
 * Until now nothing in this product told anyone that anything had happened --
 * every notification path went through Resend, which needs a verified sending
 * domain the project doesn't own, so the whole layer has been inert since it
 * was written. This is the half that works without any of that.
 *
 * Renders nothing when signed out or when the request fails, rather than an
 * empty bell: a control that never has anything behind it is worse than no
 * control.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const [items, setItems]   = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen]     = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) { setItems(null); return; }
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      setItems(null);
    }
  }

  useEffect(() => { load(); }, []);

  // Close on outside click. Without this the panel stays open behind whatever
  // the user clicks next, which reads as the page being stuck.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markAll() {
    setUnread(0);
    setItems((prev) => (prev ?? []).map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  async function markOne(id: string) {
    setUnread((u) => Math.max(0, u - 1));
    setItems((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  if (items === null) return null;

  return (
    <div ref={ref} style={{ position: "relative", lineHeight: 1 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("notifications.title")}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#9C8E82", padding: 0, display: "flex", position: "relative", transition: "color 150ms ease" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#3D3630")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#9C8E82")}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span style={{ position: "absolute", top: "-5px", right: "-6px", minWidth: "15px", height: "15px", padding: "0 3px", borderRadius: "8px", background: "var(--cr-copper)", color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "26px", width: "320px", maxHeight: "400px", overflowY: "auto", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "0 6px 24px rgba(26,22,18,0.12)", zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid var(--cr-rule)" }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)" }}>
              {t("notifications.title")}
            </span>
            {unread > 0 && (
              <button onClick={markAll}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-copper)", textDecoration: "underline", padding: 0 }}>
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p style={{ padding: "24px 12px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
              {t("notifications.empty")}
            </p>
          ) : (
            items.map((n) => {
              const inner = (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "7px" }}>
                    {!n.read_at && (
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--cr-copper)", marginTop: "5px", flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: n.read_at ? 400 : 600, fontSize: "12px", color: "var(--cr-ink)", lineHeight: 1.4 }}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-3)", lineHeight: 1.45, marginTop: "2px" }}>
                          {n.body}
                        </p>
                      )}
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "var(--cr-ink-4)", marginTop: "3px" }}>
                        {formatDate(n.created_at)}
                      </p>
                    </div>
                  </div>
                </>
              );

              const style: React.CSSProperties = {
                display: "block", padding: "10px 12px",
                borderBottom: "1px solid var(--cr-rule)",
                background: n.read_at ? "transparent" : "var(--cr-copper-bg)",
                textDecoration: "none", cursor: "pointer",
              };

              // A notification with a destination is a link; one without is
              // still clickable so it can be marked read.
              return n.href ? (
                <Link key={n.id} href={n.href} onClick={() => { markOne(n.id); setOpen(false); }} style={style}>
                  {inner}
                </Link>
              ) : (
                <div key={n.id} onClick={() => markOne(n.id)} style={style}>{inner}</div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
