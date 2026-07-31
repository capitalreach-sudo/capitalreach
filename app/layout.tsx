import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ToastNotifyProvider } from "@/components/ui/toast-notify";
import { LaunchBanner } from "@/components/ui/LaunchBanner";
import { LocaleChangeToast } from "@/components/ui/LocaleChangeToast";
import { RuleLabelAnimator } from "@/components/ui/RuleLabelAnimator";
import { ServiceWorkerRegistrar } from "@/components/shared/service-worker";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { isRTL, getLocaleFont } from "@/lib/locale";
import { getLocale } from "@/lib/locale-server";
import { brand } from "@/lib/brand";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Tints the browser chrome on Android and the status bar in the installed
  // app, so the shell reads as part of the product rather than a web view.
  themeColor: "#B5651D", // --cr-copper
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
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
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
  const rtl = isRTL(locale);
  const extraFont = getLocaleFont(locale);

  return (
    <html lang={locale} dir={rtl ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
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
        <RuleLabelAnimator />
        <LaunchBanner />
        <LocaleChangeToast />
        {children}
        <Toaster />
        <ToastNotifyProvider />
        <ServiceWorkerRegistrar />
        </LocaleProvider>
      </body>
    </html>
  );
}
