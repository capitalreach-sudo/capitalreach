import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ToastNotifyProvider } from "@/components/ui/toast-notify";
import { LaunchBanner } from "@/components/ui/LaunchBanner";
import { LocaleChangeToast } from "@/components/ui/LocaleChangeToast";
import { RuleLabelAnimator } from "@/components/ui/RuleLabelAnimator";
import { ServiceWorkerRegistrar } from "@/components/shared/service-worker";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { CommandPalette } from "@/components/shared/command-palette";
import { cookies } from "next/headers";
import { BottomNav } from "@/components/shared/bottom-nav";
import { SiteAssistant } from "@/components/shared/site-assistant";
import { ShortcutsHelp } from "@/components/shared/shortcuts-help";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { isRTL, getLocaleFont } from "@/lib/locale";
import { getLocale } from "@/lib/locale-server";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getLocale();
  // Theme before first byte: the toggle writes cr_theme, the server stamps
  // the attribute, and no visitor ever sees a flash of the wrong theme.
  let theme: "light" | "dark" = "light";
  try {
    theme = cookies().get("cr_theme")?.value === "dark" ? "dark" : "light";
  } catch { /* static rendering contexts have no cookies; light is the default */ }
  const rtl = isRTL(locale);
  const extraFont = getLocaleFont(locale);

  return (
    <html lang={locale} dir={rtl ? "rtl" : "ltr"} data-theme={theme} suppressHydrationWarning>
      <head>
        {/* First in head: the connection is warm before any font CSS asks for it. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
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
        <LocaleProvider initialLocale={locale}>
        <SkipToContent />
        <RuleLabelAnimator />
        <LaunchBanner />
        <LocaleChangeToast />
        {children}
        {/* Global shell. The Navbar is mounted per page, but these three are
            the same everywhere, so the layout is the one place they belong. */}
        <CommandPalette />
        <ShortcutsHelp />
        <ScrollToTop />
        <BottomNav />
        {/* Ask about this page. Hides itself on the working surfaces. */}
        <SiteAssistant />
        <LiveRegion />
        <Toaster />
        <ToastNotifyProvider />
        <ServiceWorkerRegistrar />
        </LocaleProvider>
      </body>
    </html>
  );
}
