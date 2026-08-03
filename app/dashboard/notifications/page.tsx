"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BellOff } from "lucide-react";
import { TYPE_ICON, FALLBACK_ICON } from "@/lib/notification-icons";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

interface Row {
  id: string; type: string; title: string; body: string | null;
  href: string | null; read_at: string | null; created_at: string;
}

/**
 * The bell's dropdown shows the latest few and vanishes on click-away; this is
 * the same feed as a page you can actually read through. Same API, same icon
 * language as the dropdown, so nothing here can drift from what the bell says.
 */
export default function NotificationsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unread, setUnread] = useState(0);

  // True while a full page came back last time -- i.e. there may be more.
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  async function load() {
    const res = await fetch("/api/notifications");
    if (!res.ok) { setRows([]); return; }
    const d = await res.json();
    setRows(d.notifications ?? []);
    setUnread(d.unread ?? 0);
    setMore((d.notifications ?? []).length === 30);
  }
  useEffect(() => { load(); }, []);

  async function loadMore() {
    if (!rows?.length) return;
    setLoadingMore(true);
    const last = rows[rows.length - 1];
    const res = await fetch(
      `/api/notifications?before=${encodeURIComponent(last.created_at)}&beforeId=${encodeURIComponent(last.id)}`
    );
    setLoadingMore(false);
    if (!res.ok) return;
    const d = await res.json();
    const next: Row[] = d.notifications ?? [];
    setRows([...rows, ...next]);
    setMore(next.length === 30);
  }

  async function markAll() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    load();
  }

  async function markOne(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> {t("common.back")}
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-cr-ink">{t("notifications.title")}</h1>
          </div>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAll}>
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>

        {rows === null ? (
          <p className="text-sm text-cr-i4">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <div className="bg-cr-paper border rounded-2xl p-10 text-center">
            <BellOff className="h-8 w-8 text-cr-p4 mx-auto mb-3" />
            <p className="text-sm text-cr-i3">{t("notifications.empty")}</p>
          </div>
        ) : (
          <div className="bg-cr-paper border rounded-2xl divide-y">
            {rows.map((n) => {
              const { Icon, color } = TYPE_ICON[n.type] ?? FALLBACK_ICON;
              const inner = (
                <div className="flex items-start gap-3 p-4">
                  <Icon aria-hidden className="h-4 w-4 shrink-0 mt-0.5" style={{ color }} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm text-cr-ink ${n.read_at ? "font-normal" : "font-semibold"}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="text-sm text-cr-i3 mt-0.5">{n.body}</p>}
                    <p className="text-xs text-cr-i4 mt-1 font-mono">{formatDate(n.created_at)}</p>
                  </div>
                  {!n.read_at && <span className="h-2 w-2 rounded-full bg-cr-copper shrink-0 mt-1.5" />}
                </div>
              );
              return n.href ? (
                <Link key={n.id} href={n.href} onClick={() => markOne(n.id)}
                  className={`block hover:bg-cr-p2 transition-colors ${n.read_at ? "" : "bg-cr-copper/5"}`}>
                  {inner}
                </Link>
              ) : (
                <button key={n.id} type="button" onClick={() => markOne(n.id)}
                  className={`block w-full text-left hover:bg-cr-p2 transition-colors ${n.read_at ? "" : "bg-cr-copper/5"}`}>
                  {inner}
                </button>
              );
            })}
          </div>
        )}

        {more && rows && rows.length > 0 && (
          <div className="mt-4 text-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? t("common.loading") : t("notifications.loadMore")}
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
