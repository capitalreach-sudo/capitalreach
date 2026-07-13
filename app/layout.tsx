import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ToastNotifyProvider } from "@/components/ui/toast-notify";
import { LaunchBanner } from "@/components/ui/LaunchBanner";
import { isRTL } from "@/lib/locale";
import { getLocale } from "@/lib/locale-server";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "CapitalReach — Startup Investment Marketplace",
    template: "%s | CapitalReach",
  },
  description:
    "Connect vetted early-stage startups with investors. Browse, filter, and fund the next generation of companies on CapitalReach.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://capitalreach.com"),
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getLocale();
  const rtl = isRTL(locale);
  return (
    <html lang={locale} dir={rtl ? "rtl" : "ltr"} suppressHydrationWarning>
      <body className={inter.className}>
        <LaunchBanner />
        {children}
        <Toaster />
        <ToastNotifyProvider />
      </body>
    </html>
  );
}
