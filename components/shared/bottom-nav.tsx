"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Compass, Handshake, MessageSquare, Bell } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useProfile } from "@/hooks/useProfile";

/**
 * Mobile tab bar for signed-in users.
 *
 * Everything a member does daily -- check the dashboard, browse the other side
 * of the marketplace, move a deal, answer a message, clear alerts -- was
 * previously two taps deep behind the hamburger. On a phone that is the whole
 * product hidden behind a menu button. These five destinations are now one
 * thumb-reach tap from anywhere.
 *
 * Signed-out visitors get nothing: their job is to read the pitch and sign up,
 * and a tab bar over marketing pages would only cover copy.
 */
type Tab = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  badge?: number;
};

export function BottomNav() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const pathname = usePathname();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    const load = async () => {
      const [m, n] = await Promise.allSettled([
        fetch("/api/messages/unread").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/notifications").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!alive) return;
      if (m.status === "fulfilled" && m.value) setUnreadMessages(m.value.unread ?? 0);
      if (n.status === "fulfilled" && n.value) setUnreadAlerts(n.value.unread ?? 0);
    };
    load();
    // Re-count on navigation: opening the messages page clears its badge.
    return () => {
      alive = false;
    };
  }, [profile, pathname]);

  // Tells the stylesheet a tab bar is present, so --cr-tabbar-h stops being 0
  // and the spacer, the fee badge and the compare tray all move up together.
  // The media query, not this flag, decides that desktop keeps its zero.
  useEffect(() => {
    if (!profile) return;
    document.documentElement.dataset.crTabbar = "1";
    return () => { delete document.documentElement.dataset.crTabbar; };
  }, [profile]);

  if (!profile) return null;

  const dashboardPath =
    profile.role === "startup" ? "/dashboard/startup"
    : profile.role === "admin" ? "/admin"
    : "/dashboard/investor";

  // Browse points at the *other* side of the marketplace: a founder wants
  // investors, an investor wants listings. Sending both to /startups would
  // make the tab useless for half the members.
  const browseHref = profile.role === "startup" ? "/investors" : "/startups";

  const tabs: Tab[] = [
    { href: dashboardPath, label: t("nav.home"), Icon: LayoutDashboard },
    { href: browseHref, label: t("nav.browse"), Icon: Compass },
    { href: "/deals", label: t("nav.deals"), Icon: Handshake },
    { href: "/dashboard/messages", label: t("nav.messages"), Icon: MessageSquare, badge: unreadMessages },
    { href: "/dashboard/notifications", label: t("nav.alerts"), Icon: Bell, badge: unreadAlerts },
  ];

  return (
    <>
      {/* Keeps the last row of any page clear of the fixed bar (see globals.css). */}
      <div className="cr-bottom-nav-spacer" aria-hidden />
      <nav
        className="cr-bottom-nav lg:hidden"
        aria-label={t("nav.primaryMobile")}
      >
      {tabs.map(({ href, label, Icon, badge }) => {
        // Exact match for the dashboards: /dashboard/startup must not light up
        // while the user is on /dashboard/messages.
        const active = href.startsWith("/dashboard/") || href === "/admin"
          ? pathname === href
          : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              minHeight: "52px",
              textDecoration: "none",
              color: active ? "var(--cr-copper)" : "var(--cr-ink-4)",
              position: "relative",
            }}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              {!!badge && badge > 0 && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "-4px",
                    insetInlineEnd: "-7px",
                    minWidth: "15px",
                    height: "15px",
                    padding: "0 4px",
                    borderRadius: "999px",
                    background: "var(--cr-copper)",
                    color: "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: "9px",
                    lineHeight: "15px",
                    textAlign: "center",
                  }}
                >
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: active ? 600 : 400,
                fontSize: "10px",
                letterSpacing: "0.01em",
              }}
            >
              {label}
            </span>
            {!!badge && badge > 0 && (
              <span className="sr-only">{t("nav.unreadCount", { count: badge })}</span>
            )}
          </Link>
        );
      })}
      </nav>
    </>
  );
}
