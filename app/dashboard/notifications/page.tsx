"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BellOff, X } from "lucide-react";
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

  // Tabs are a server-side type filter, so pagination stays correct inside a
  // tab instead of filtering already-fetched pages client-side.
  const TAB_TYPES: Record<string, string> = {
    all: "",
    deals: "deal_opened,deal_stage,deal_closed,deal_passed,follow_up_due,contract_status,nda_signed",
    interest: "listing_saved,listing_update,search_match",
    account: "listing_approved,listing_rejected,team_added,tier_changed,message",
  };
  const [tab, setTab] = useState<keyof typeof TAB_TYPES>("all");

  async function load(forTab: string = tab) {
    const typesQ = TAB_TYPES[forTab] ? `?types=${TAB_TYPES[forTab]}` : "";
    const res = await fetch(`/api/notifications${typesQ}`);
    if (!res.ok) { setRows([]); return; }
    const d = await res.json();
    setRows(d.notifications ?? []);
    setUnread(d.unread ?? 0);
    setMore((d.notifications ?? []).length === 30);
  }
  useEffect(() => { setRows(null); load(tab); }, [tab]);

  async function loadMore() {
    if (!rows?.length) return;
    setLoadingMore(true);
    const last = rows[rows.length - 1];
    const typesQ = TAB_TYPES[tab] ? `&types=${TAB_TYPES[tab]}` : "";
    const res = await fetch(
      `/api/notifications?before=${encodeURIComponent(last.created_at)}&beforeId=${encodeURIComponent(last.id)}${typesQ}`
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

  async function removeOne(id: string) {
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev);
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function clearRead() {
    setRows((prev) => prev?.filter((r) => !r.read_at) ?? prev);
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allRead: true }),
    });
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
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <Button variant="outline" size="sm" onClick={markAll}>
                {t("notifications.markAllRead")}
              </Button>
            )}
            {(rows?.some((r) => r.read_at) ?? false) && (
              <Button variant="ghost" size="sm" onClick={clearRead}>
                {t("notifications.clearRead")}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 mb-4 border-b border-cr-p4">
          {(Object.keys(TAB_TYPES) as Array<keyof typeof TAB_TYPES>).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3.5 py-2 text-sm transition-colors border-b-2 -mb-px ${
                tab === k ? "border-cr-copper text-cr-ink font-semibold" : "border-transparent text-cr-i4 hover:text-cr-i2"
              }`}>
              {t(`notifications.tab_${k}`)}
            </button>
          ))}
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
            {rows.map((n, idx) => {
              // A date rule whenever the day changes: a long feed reads as
              // "today / yesterday / last week", not one undifferentiated wall.
              const dayOf = (iso: string) => new Date(iso).toDateString();
              const newDay = idx === 0 || dayOf(rows[idx - 1].created_at) !== dayOf(n.created_at);
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
              const row = n.href ? (
                <Link href={n.href} onClick={() => markOne(n.id)}
                  className={`block hover:bg-cr-p2 transition-colors ${n.read_at ? "" : "bg-cr-copper/5"}`}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={() => markOne(n.id)}
                  className={`block w-full text-left hover:bg-cr-p2 transition-colors ${n.read_at ? "" : "bg-cr-copper/5"}`}>
                  {inner}
                </button>
              );

              return (
                <div key={n.id}>
                  {newDay && (
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-cr-i4 bg-cr-p2/40">
                      {formatDate(n.created_at)}
                    </p>
                  )}
                  <div className="relative group/row">
                    {row}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeOne(n.id); }}
                      aria-label={`dismiss ${n.title}`}
                      className="absolute top-3 right-3 text-cr-i4 hover:text-cr-ink opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
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
