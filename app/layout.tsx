import type { Metadata, Viewport } from "next";
import { DeferredChrome } from "@/components/shared/deferred-chrome";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ToastNotifyProvider } from "@/components/ui/toast-notify";
import { LaunchBanner } from "@/components/ui/LaunchBanner";
import { LocaleChangeToast } from "@/components/ui/LocaleChangeToast";
import { RuleLabelAnimator } from "@/components/ui/RuleLabelAnimator";
import { ServiceWorkerRegistrar } from "@/components/shared/service-worker";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { cookies } from "next/headers";
import { BottomNav } from "@/components/shared/bottom-nav";
import { ShortcutsHelp } from "@/components/shared/shortcuts-help";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { isRTL, getLocaleFont } from "@/lib/locale";
import { getLocale, getMessages } from "@/lib/locale-server";
import { brand } from "@/lib/brand";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Lets the page paint into the notch and home-indicator areas, which is what
  // makes env(safe-area-inset-*) report real values -- the mobile tab bar pads
  // itself with the bottom inset so its labels clear the home indicator.
  viewportFit: "cover",
  // Tints the browser chrome on Android and the status bar in the installed
  // app, so the shell reads as part of the product rather than a web view.
  themeColor: "var(--cr-copper)", // --cr-copper
};

export const metadata: Metadata = {
  title: {
    default: "CapitalReach — Startup Investment Marketplace",
    template: "%s | CapitalReach",
  },
  description:
    "Connect vetted early-stage startups with investors. Browse, filter, and fund the next generation of companies on CapitalReach.",
  metadataBase: new URL(brand.url),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: "CapitalReach",
    // og:image comes from the app/opengraph-image.tsx file convention; the
    // explicit entry here used to point at /og-default.png, which never existed.
  },
  twitter: {
    card: "summary_large_image",
    site: "@capitalreach",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS ignores the manifest entirely and reads this instead.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "CapitalReach",
    statusBarStyle: "default",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getLocale();
  // Inline only the active locale's dictionary, and only when it is not English
  // -- useTranslation already carries English statically as its fallback, so an
  // English page pays nothing here. This is what replaced shipping all 15
  // locales (~3.2 MB) to every visitor: they now get their own language alone.
  const messages = locale === "en" ? null : await getMessages(locale);
  // Theme before first byte: the toggle writes cr_theme, the server stamps
  // the attribute, and no visitor ever sees a flash of the wrong theme.
  let theme: "light" | "dark" = "dark";
  // Visual STYLE, orthogonal to light/dark: "business" (the Swiss
  // private-bank register) or "editorial" (the warm serif identity the
  // product launched with). BUSINESS is the default face of the product
  // (Jack's call, 2026-09-04): it is the register buyers and investors
  // expect. Editorial survives per user via the toggle's explicit cookie.
  // Server-stamped like the theme so there is no flash of the wrong style.
  let style: "editorial" | "business" = "business";
  try {
    // Dark is the DEFAULT: the professional register of the product. The
    // toggle still writes an explicit choice, so "light" survives per user.
    theme = cookies().get("cr_theme")?.value === "light" ? "light" : "dark";
    style = cookies().get("cr_style")?.value === "editorial" ? "editorial" : "business";
  } catch { /* static rendering contexts have no cookies */ }
  const rtl = isRTL(locale);
  const extraFont = getLocaleFont(locale);

  return (
    <html lang={locale} dir={rtl ? "rtl" : "ltr"} data-theme={theme} data-style={style} suppressHydrationWarning>
      <head>
        {/* First in head: the connection is warm before any font CSS asks for it. */}
        {/* The client talks to Supabase from the first interactive moment
            (session, saved lists, sparklines) — pay the TLS setup early. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="" />
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The house families load from the head, in parallel with the app
            CSS -- this used to be an @import inside globals.css, which
            chained html -> css -> google css -> font and billed ~1s of
            render-blocking to every page. Fraunces requests only the axis
            ranges the site actually sets (wght 600-700, SOFT 0-50). */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,600..700,0..50,0..1;1,9..144,600..700,0..50,0..1&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&family=JetBrains+Mono:wght@400;500;600&family=Cairo:wght@300;400;500;600;700&display=swap" />
        {extraFont && (
          <link
            rel="stylesheet"
            href={`https://fonts.googleapis.com/css2?family=${extraFont.replace(/ /g, "+")}:wght@300;400;500;600;700&display=swap`}
          />
        )}
      </head>
      <body className="font-sans">
        {/* Seeds every client component with the server-resolved locale, so the
            first paint is already correct rather than English-then-swap. */}
        <LocaleProvider initialLocale={locale} initialMessages={messages}>
        <SkipToContent />
        <RuleLabelAnimator />
        <LaunchBanner />
        <LocaleChangeToast />
        {children}
        {/* Global shell. The Navbar is mounted per page, but these three are
            the same everywhere, so the layout is the one place they belong. */}
        <ShortcutsHelp />
        <ScrollToTop />
        <BottomNav />
        {/* Ask about this page. Hides itself on the working surfaces. */}
        <DeferredChrome />
        <LiveRegion />
        <Toaster />
        <ToastNotifyProvider />
        <ServiceWorkerRegistrar />
        </LocaleProvider>
        {/* The paper-grain source: an SVG turbulence filter referenced by
            body::before. Rendered once, invisible, zero layout cost. */}
        <svg className="hidden" aria-hidden="true" width="0" height="0">
          <filter id="paper-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="discrete" tableValues="0 0 0 0 0.04 0.04 0.06" />
            </feComponentTransfer>
          </filter>
        </svg>
      </body>
    </html>
  );
}
