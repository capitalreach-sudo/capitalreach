"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X, Volume2, VolumeX } from "lucide-react";
import { TYPE_ICON, FALLBACK_ICON } from "@/lib/notification-icons";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";
import { useProfile } from "@/hooks/useProfile";
import { soundEnabled, setSoundEnabled, playPing } from "@/lib/notification-sound";

interface Row {
  id: string; type: string; title: string; body: string | null;
  href: string | null; read_at: string | null; created_at: string;
}

// ── House register ─────────────────────────────────────────────────────────
// The feed is one 4px token card; hairline rules separate rows and mark day
// changes -- never boxes-in-boxes. Filters are Label-type chips (3px radius,
// hairline border, small caps). Every date renders in JetBrains Mono. One
// quiet primary per view: mark all read.
const CARD: React.CSSProperties = {
  background: "var(--cr-paper)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};
const CHIP: React.CSSProperties = {
  minHeight: "40px",
  padding: "0 12px",
  borderRadius: "3px",
  borderWidth: 1,
  borderStyle: "solid",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "11px",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  cursor: "pointer",
  background: "transparent",
  transition: "color 120ms ease, border-color 120ms ease, background 120ms ease",
};

/**
 * The bell's dropdown shows the latest few and vanishes on click-away; this is
 * the same feed as a page you can actually read through. Same API, same icon
 * language as the dropdown, so nothing here can drift from what the bell says.
 */
export default function NotificationsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [unread, setUnread] = useState(0);

  // True while a full page came back last time -- i.e. there may be more.
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Tabs are a server-side type filter, so pagination stays correct inside a
  // tab instead of filtering already-fetched pages client-side — and they
  // speak the READER's language: an operator gets a Platform tab for
  // alerts instead of being told about "their listing" they do not have.
  const { profile } = useProfile();
  const role = profile?.role ?? "investor";
  const TAB_TYPES: Record<string, string> = role === "admin" ? {
    all: "",
    deals: "deal_opened,deal_stage,deal_closed,deal_passed,follow_up_due,contract_status,nda_signed",
    platform: "admin_alert,complaint_update,fee_due",
    account: "team_added,tier_changed,message,interest",
  } : {
    all: "",
    deals: "deal_opened,deal_stage,deal_closed,deal_passed,follow_up_due,contract_status,nda_signed",
    interest: "listing_saved,listing_update,search_match,interest,doc_request",
    account: "listing_approved,listing_rejected,team_added,tier_changed,message,verified,complaint_update,fee_due",
  };
  const [tab, setTab] = useState<keyof typeof TAB_TYPES>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sound, setSound] = useState(true);
  useEffect(() => { setSound(soundEnabled()); }, []);

  async function load(forTab: string = tab) {
    const typesQ = TAB_TYPES[forTab] ? `?types=${TAB_TYPES[forTab]}` : "";
    try {
      const res = await fetch(`/api/notifications${typesQ}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setLoadError(false);
      setRows(d.notifications ?? []);
      setUnread(d.unread ?? 0);
      setMore((d.notifications ?? []).length === 30);
    } catch {
      // A failed load must not masquerade as an empty inbox.
      setLoadError(true);
      setRows([]);
    }
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
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => null);
    if (!res?.ok) { notify.error(t("errors.generic")); return; }
    load();
  }

  async function removeOne(id: string) {
    const prevRows = rows;
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev);
    const res = await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    if (!res?.ok) { setRows(prevRows); notify.error(t("errors.generic")); }
  }

  async function clearRead() {
    const prevRows = rows;
    setRows((prev) => prev?.filter((r) => !r.read_at) ?? prev);
    const res = await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allRead: true }),
    }).catch(() => null);
    if (!res?.ok) { setRows(prevRows); notify.error(t("errors.generic")); }
  }

  async function markOne(id: string) {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    if (!res?.ok) { notify.error(t("errors.generic")); return; }
    load();
  }

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 md:py-12 max-w-2xl" style={{ background: "var(--cr-paper)" }}>
        <header className="mb-8 pb-6" style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
          <div className="mb-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="-ml-2 h-10 gap-1.5">
                <ArrowLeft className="h-4 w-4" /> {t("common.back")}
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap items-end justify-between" style={{ gap: "16px" }}>
            <div>
              <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("dashboard.inbox")}</div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 36px)", lineHeight: 1.15, letterSpacing: "-0.02em", color: "var(--cr-ink)" }}>
                {t("notifications.title")}
              </h1>
            </div>
            <div className="flex flex-wrap items-center" style={{ gap: "12px" }}>
              <button
                onClick={() => {
                  const next = !sound;
                  setSoundEnabled(next); setSound(next);
                  // An immediate demo ping doubles as the browser-audio unlock:
                  // enabling sound IS a user gesture, so this primes autoplay.
                  if (next) playPing();
                }}
                aria-label={sound ? t("notifications.soundOff") : t("notifications.soundOn")}
                title={sound ? t("notifications.soundOff") : t("notifications.soundOn")}
                className="flex h-10 w-10 items-center justify-center text-cr-i4 hover:text-cr-i2 transition-colors"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              {(rows?.some((r) => r.read_at) ?? false) && (
                <button onClick={clearRead}
                  className="text-cr-i4 hover:text-cr-i2 transition-colors"
                  style={{ minHeight: "40px", padding: "0 12px", background: "transparent", border: "none", fontSize: "13px", fontWeight: 400, cursor: "pointer" }}>
                  {t("notifications.clearRead")}
                </button>
              )}
              {/* The one quiet primary on this view. */}
              {unread > 0 && (
                <button onClick={markAll}
                  style={{ minHeight: "40px", padding: "0 16px", borderRadius: "999px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  {t("notifications.markAllRead")}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* One filter lane: type chips left, the unread toggle pushed right. */}
        <div className="flex flex-wrap items-center" style={{ gap: "12px", marginBottom: "16px" }}>
          {(Object.keys(TAB_TYPES) as Array<keyof typeof TAB_TYPES>).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={tab === k ? "text-cr-copper" : "text-cr-i4 hover:text-cr-i2"}
              style={{
                ...CHIP,
                borderColor: tab === k ? "var(--cr-copper-br)" : "var(--cr-paper-4)",
                background: tab === k ? "var(--cr-copper-bg)" : "transparent",
              }}>
              {t(`notifications.tab_${k}`)}
            </button>
          ))}
          <button onClick={() => setUnreadOnly(v => !v)}
            className={`ml-auto ${unreadOnly ? "text-cr-copper" : "text-cr-i4 hover:text-cr-i2"}`}
            style={{
              ...CHIP,
              borderColor: unreadOnly ? "var(--cr-copper-br)" : "var(--cr-paper-4)",
              background: unreadOnly ? "var(--cr-copper-bg)" : "transparent",
            }}>
            {t("notifications.unreadOnly")}
            {unread > 0 && <span className="font-mono" style={{ fontWeight: 600 }}>({unread})</span>}
          </button>
        </div>

        {rows === null ? (
          <p className="text-sm font-light text-cr-i4">{t("common.loading")}</p>
        ) : loadError ? (
          <div className="text-center" style={{ ...CARD, padding: "48px 24px" }}>
            <p className="text-sm font-light text-cr-i3" style={{ marginBottom: "16px" }}>{t("errorPage.sectionTitle")}</p>
            <button onClick={() => { setRows(null); load(); }}
              className="text-[13px] text-cr-ink" style={{ background: "transparent", border: "1px solid var(--cr-paper-4)", borderRadius: "999px", minHeight: "40px", padding: "0 16px", cursor: "pointer" }}>
              {t("errorPage.retry")}
            </button>
          </div>
        ) : (unreadOnly ? rows.filter((r) => !r.read_at) : rows).length === 0 ? (
          // Empty state, house grammar: one diamond, one sentence, one quiet action.
          <div className="text-center" style={{ ...CARD, padding: "48px 24px" }}>
            <span aria-hidden style={{ display: "block", color: "var(--cr-copper)", fontSize: "16px", lineHeight: 1, marginBottom: "16px" }}>✦</span>
            <p className="text-sm font-light leading-relaxed text-cr-i3" style={{ maxWidth: "44ch", margin: "0 auto" }}>
              {t(role === "admin" ? "notifications.emptyAdmin" : role === "startup" ? "notifications.emptyFounder" : "notifications.emptyInvestor")}
            </p>
            <Link href="/dashboard"
              className="inline-flex items-center justify-center text-[13px] text-cr-ink"
              style={{ minHeight: "40px", padding: "0 16px", borderRadius: "999px", border: "1px solid var(--cr-paper-4)", textDecoration: "none", marginTop: "24px" }}>
              {t("common.back")}
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden" style={CARD}>
            {(unreadOnly ? rows.filter((r) => !r.read_at) : rows).map((n, idx, view) => {
              // A date rule whenever the day changes: a long feed reads as
              // "today / yesterday / last week", not one undifferentiated wall.
              const dayOf = (iso: string) => new Date(iso).toDateString();
              const newDay = idx === 0 || dayOf(view[idx - 1].created_at) !== dayOf(n.created_at);
              const { Icon, color } = TYPE_ICON[n.type] ?? FALLBACK_ICON;
              const inner = (
                <div className="flex items-start gap-3 p-4 pr-12">
                  <Icon aria-hidden className="h-4 w-4 shrink-0 mt-0.5" style={{ color }} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm text-cr-ink ${n.read_at ? "font-normal" : "font-semibold"}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="text-sm font-light text-cr-i3 mt-0.5">{n.body}</p>}
                    <p className="text-[11px] text-cr-i4 mt-1 font-mono">{formatDate(n.created_at)}</p>
                  </div>
                  {/* Unread marker: the house diamond, copper. */}
                  {!n.read_at && <span aria-hidden className="shrink-0 text-cr-copper" style={{ fontSize: "10px", lineHeight: 1, marginTop: "4px" }}>✦</span>}
                </div>
              );
              const row = n.href ? (
                <Link href={n.href} onClick={() => markOne(n.id)}
                  className={`block hover:bg-cr-p3 transition-colors ${n.read_at ? "" : "bg-cr-copper/5"}`}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={() => markOne(n.id)}
                  className={`block w-full text-left hover:bg-cr-p3 transition-colors ${n.read_at ? "" : "bg-cr-copper/5"}`}>
                  {inner}
                </button>
              );

              return (
                // Ledger lines between entries -- hairline rules, not boxes.
                <div key={n.id} style={{ borderTop: idx > 0 ? "1px solid var(--cr-rule)" : "none" }}>
                  {newDay && (
                    <p className="bg-cr-p2 font-mono px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-cr-i4">
                      {formatDate(n.created_at)}
                    </p>
                  )}
                  <div className="relative group/row">
                    {row}
                    {/* Always visible below md: touch has no hover to reveal it. */}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeOne(n.id); }}
                      aria-label={`dismiss ${n.title}`}
                      className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center text-cr-i4 hover:text-cr-ink opacity-100 md:opacity-0 md:group-hover/row:opacity-100 md:focus:opacity-100 transition-opacity"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
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
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}
              className="h-10 rounded-full border-cr-p4 px-5 text-[13px] text-cr-ink">
              {loadingMore ? t("common.loading") : t("notifications.loadMore")}
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
