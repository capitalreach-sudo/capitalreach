"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { Menu, X, LogOut, Settings, LayoutDashboard, MessageSquare, ChevronDown } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useTranslation } from "@/hooks/useTranslation";
import type { Profile } from "@/types";

const DiamondLogo = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden>
    <rect x="1" y="1" width="8" height="8" rx="1"
      fill="none" stroke="#B5651D" strokeWidth="1.5"
      transform="rotate(45 5 5)" />
  </svg>
);

export function Navbar() {
  const { t, locale } = useTranslation();
  const [profile, setProfile]       = useState<Profile | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled]     = useState(false);
  const router   = useRouter();
  const pathname = usePathname();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const NAV_LINKS = [
    { href: "/startups",  label: t("nav.startups")  },
    { href: "/investors", label: t("nav.investors") },
    { href: "/ai",        label: t("nav.aiTools")   },
    { href: "/pricing",   label: t("nav.pricing")   },
    { href: "/data",      label: t("nav.data")      },
  ];

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: p } = await supabase
          .from("profiles").select("*").eq("id", data.user.id).single();
        setProfile(p);
      }
    });
  }, [supabase]);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 40); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const dashboardPath =
    profile?.role === "startup" ? "/dashboard/startup"
    : profile?.role === "admin" ? "/admin"
    : "/dashboard/investor";

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <>
      {/* ── Main bar ── */}
      <nav
        className="sticky top-0 z-50 h-[56px]"
        style={{
          background:   "#F5F0E8",
          borderBottom: `1px solid ${scrolled ? "rgba(26,22,18,0.1)" : "transparent"}`,
          transition:   "border-color 200ms ease",
        }}
      >
        <div className="flex items-center justify-between h-full max-w-[1200px] mx-auto px-6 lg:px-10">

          {/* Logo + 2% signal */}
          <div className="flex items-center gap-4 flex-shrink-0 select-none">
            <Link href="/" className="flex items-center gap-[10px]" style={{ textDecoration: "none" }}>
              <DiamondLogo size={10} />
              <span style={{
                fontFamily:    "'Playfair Display', Georgia, serif",
                fontWeight:    700,
                fontSize:      "18px",
                color:         "#1A1612",
                letterSpacing: "-0.02em",
                lineHeight:    1,
              }}>
                CapitalReach
              </span>
            </Link>

            {/* 2% at close signal — desktop only */}
            <div className="hidden lg:flex items-center gap-3" aria-label="2% success fee at close">
              <div style={{ width: "1px", height: "20px", background: "rgba(26,22,18,0.15)" }} />
              <span style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                fontSize: "11px", color: "#B5651D", letterSpacing: "0.02em",
                display: "flex", alignItems: "center", gap: "5px",
              }}>
                <span style={{ fontSize: "9px" }}>◆</span>
                2% at close
              </span>
            </div>
          </div>

          {/* Center links — desktop */}
          <div className="hidden lg:flex items-center gap-10">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="relative pb-[2px]"
                style={{
                  fontFamily:     "'DM Sans', sans-serif",
                  fontWeight:     400,
                  fontSize:       "14px",
                  color:          isActive(href) ? "#1A1612" : "#6B6056",
                  transition:     "color 150ms ease",
                  textDecoration: "none",
                }}
                onMouseEnter={e => !isActive(href) && ((e.currentTarget as HTMLElement).style.color = "#1A1612")}
                onMouseLeave={e => !isActive(href) && ((e.currentTarget as HTMLElement).style.color = "#6B6056")}
              >
                {label}
                {isActive(href) && (
                  <span
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: "1.5px", background: "#B5651D", borderRadius: "1px" }}
                  />
                )}
              </Link>
            ))}
          </div>

          {/* Right — auth */}
          <div className="hidden lg:flex items-center gap-5">
            <LanguageSwitcher currentLocale={locale} />
            {profile ? (
              <>
                <Link href="/dashboard/messages"
                  style={{ color: "#9C8E82", transition: "color 150ms ease", lineHeight: 1 }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#3D3630")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#9C8E82")}
                >
                  <MessageSquare className="h-4 w-4" />
                </Link>
                <div className="relative group">
                  <button
                    className="flex items-center gap-1.5 px-2 py-1 rounded-[4px] transition-colors"
                    style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#E4DDD2")}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  >
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{ background: "#E4DDD2", border: "1px solid #D8D0C4" }}
                    >
                      {profile.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#B5651D" }}>
                          {getInitials(profile.full_name || profile.email)}
                        </span>
                      )}
                    </div>
                    <ChevronDown className="h-3 w-3" style={{ color: "#9C8E82" }} />
                  </button>

                  {/* Dropdown */}
                  <div
                    className="absolute right-0 mt-1 w-52 py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50"
                    style={{
                      background:   "#EDE8DE",
                      border:       "1px solid rgba(26,22,18,0.2)",
                      borderRadius: "6px",
                      boxShadow:    "0 8px 32px rgba(26,22,18,0.12)",
                    }}
                  >
                    <div className="px-4 py-3 mb-1" style={{ borderBottom: "1px solid rgba(26,22,18,0.1)" }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "#1A1612", fontFamily: "'DM Sans', sans-serif" }} className="truncate">
                        {profile.full_name || "Account"}
                      </p>
                      <p style={{ fontSize: "11px", color: "#9C8E82", fontFamily: "'DM Sans', sans-serif" }} className="truncate mt-0.5">
                        {profile.email}
                      </p>
                    </div>
                    {[
                      { href: dashboardPath,         Icon: LayoutDashboard, label: t("nav.dashboard") },
                      { href: "/dashboard/messages", Icon: MessageSquare,   label: t("nav.messages")  },
                      { href: "/dashboard/settings", Icon: Settings,        label: t("nav.settings")  },
                    ].map(({ href, Icon, label }) => (
                      <Link key={href} href={href}
                        className="flex items-center gap-3 px-4 py-2 mx-1 rounded-[3px] transition-colors"
                        style={{ fontSize: "13px", fontFamily: "'DM Sans', sans-serif", color: "#6B6056", textDecoration: "none" }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = "#E4DDD2";
                          (e.currentTarget as HTMLElement).style.color = "#1A1612";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = "";
                          (e.currentTarget as HTMLElement).style.color = "#6B6056";
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </Link>
                    ))}
                    <div className="mt-1 pt-1 mx-1" style={{ borderTop: "1px solid rgba(26,22,18,0.1)" }}>
                      <button onClick={signOut}
                        className="w-full flex items-center gap-3 px-4 py-2 rounded-[3px] transition-colors"
                        style={{ fontSize: "13px", fontFamily: "'DM Sans', sans-serif", color: "#9B2335", background: "transparent", border: "none", cursor: "pointer" }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "rgba(155,35,53,0.08)")}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "")}
                      >
                        <LogOut className="h-3.5 w-3.5" /> {t("nav.logOut")}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Link href="/auth/login" style={{ textDecoration: "none" }}>
                  <button style={{
                    fontFamily:  "'DM Sans', sans-serif",
                    fontWeight:  400,
                    fontSize:    "14px",
                    color:       "#6B6056",
                    background:  "none",
                    border:      "none",
                    cursor:      "pointer",
                    transition:  "color 150ms ease",
                    padding:     0,
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#1A1612")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#6B6056")}
                  >
                    {t("nav.signIn")}
                  </button>
                </Link>
                <Link href="/auth/signup" style={{ textDecoration: "none" }}>
                  <button style={{
                    background:   "#B5651D",
                    color:        "#fff",
                    fontFamily:   "'DM Sans', sans-serif",
                    fontWeight:   600,
                    fontSize:     "14px",
                    padding:      "11px 24px",
                    borderRadius: "4px",
                    border:       "none",
                    cursor:       "pointer",
                    transition:   "background 120ms ease",
                    lineHeight:   1,
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#D4842A")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#B5651D")}
                  >
                    {t("nav.listStartup")}
                  </button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger — 24px icon, 44px touch target */}
          <button
            className="lg:hidden flex items-center justify-center"
            style={{
              width: "44px", height: "44px",
              marginRight: "-10px",
              color: "#6B6056", background: "none", border: "none", cursor: "pointer",
            }}
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
        </div>
      </nav>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-[98]"
            style={{ background: "rgba(26,22,18,0.4)" }}
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="fixed top-0 left-0 bottom-0 z-[99] flex flex-col"
            style={{
              width:       "min(80vw, 320px)",
              background:  "#EDE8DE",
              borderRight: "1px solid rgba(26,22,18,0.15)",
            }}
          >
            {/* Drawer header */}
            <div
              className="flex items-center justify-between px-5 flex-shrink-0"
              style={{ height: "56px", borderBottom: "1px solid rgba(26,22,18,0.1)" }}
            >
              <Link href="/" className="flex items-center gap-[10px]" onClick={() => setMobileOpen(false)} style={{ textDecoration: "none" }}>
                <DiamondLogo size={10} />
                <span style={{
                  fontFamily:    "'Playfair Display', Georgia, serif",
                  fontWeight:    700,
                  fontSize:      "16px",
                  color:         "#1A1612",
                  letterSpacing: "-0.02em",
                }}>
                  CapitalReach
                </span>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                style={{ color: "#6B6056", background: "none", border: "none", cursor: "pointer", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-5"
                  style={{
                    height:         "52px",
                    fontFamily:     "'DM Sans', sans-serif",
                    fontWeight:     600,
                    fontSize:       "15px",
                    color:          isActive(href) ? "#B5651D" : "#1A1612",
                    borderBottom:   "1px solid rgba(26,22,18,0.08)",
                    textDecoration: "none",
                  }}
                >
                  {label}
                </Link>
              ))}
              {profile && (
                <Link href={dashboardPath} onClick={() => setMobileOpen(false)}
                  className="flex items-center px-5"
                  style={{
                    height:         "52px",
                    fontFamily:     "'DM Sans', sans-serif",
                    fontWeight:     600,
                    fontSize:       "15px",
                    color:          "#1A1612",
                    borderBottom:   "1px solid rgba(26,22,18,0.08)",
                    textDecoration: "none",
                  }}
                >
                  {t("nav.dashboard")}
                </Link>
              )}
            </div>

            {/* Drawer footer */}
            {!profile ? (
              <div className="px-5 py-5 flex flex-col gap-3 flex-shrink-0" style={{ borderTop: "1px solid rgba(26,22,18,0.1)" }}>
                <Link href="/auth/signup" onClick={() => setMobileOpen(false)} style={{ textDecoration: "none" }}>
                  <button className="w-full" style={{
                    height: "44px", background: "#B5651D", color: "#fff",
                    fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px",
                    borderRadius: "4px", border: "none", cursor: "pointer",
                  }}>
                    {t("nav.listStartup")}
                  </button>
                </Link>
                <Link href="/auth/login" onClick={() => setMobileOpen(false)} style={{ textDecoration: "none" }}>
                  <button className="w-full" style={{
                    height: "44px", background: "transparent", color: "#3D3630",
                    fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px",
                    borderRadius: "4px", border: "1px solid #D8D0C4", cursor: "pointer",
                  }}>
                    {t("nav.signIn")}
                  </button>
                </Link>
              </div>
            ) : (
              <div className="px-5 py-5 flex-shrink-0" style={{ borderTop: "1px solid rgba(26,22,18,0.1)" }}>
                <button
                  onClick={() => { signOut(); setMobileOpen(false); }}
                  className="w-full"
                  style={{
                    height: "44px", background: "transparent", color: "#9B2335",
                    fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px",
                    borderRadius: "4px", border: "1px solid rgba(155,35,53,0.3)", cursor: "pointer",
                  }}
                >
                  {t("nav.logOut")}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
