import type { Metadata, Viewport } from "next";
// Everything non-critical the layout used to mount goes through these two
// slots. They are the only place that decides what waits; see the file itself
// for which components are in there and what each one was costing.
import { DeferredBanner, DeferredChrome } from "@/components/shared/deferred-chrome";
import "./globals.css";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { cookies, headers } from "next/headers";
import { deploymentIndexable, requestHost } from "@/lib/indexing";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { isRTL, getLocaleFont } from "@/lib/locale";
import { fontVariables } from "@/lib/fonts";
import { getLocale, getMessages } from "@/lib/locale-server";
import { brand } from "@/lib/brand";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale: capping it at 1 disables pinch-zoom on Android (iOS
  // ignores the cap), and zoom is an accessibility floor, not a layout choice.
  // Lets the page paint into the notch and home-indicator areas, which is what
  // makes env(safe-area-inset-*) report real values -- the mobile tab bar pads
  // itself with the bottom inset so its labels clear the home indicator.
  viewportFit: "cover",
  // Tints the browser chrome on Android and the status bar in the installed
  // app, so the shell reads as part of the product rather than a web view.
  // A meta tag cannot resolve a CSS variable -- the old value shipped the
  // literal string "var(--cr-copper)" and browsers silently ignored it. The
  // page grounds per scheme (light business paper, dark business paper);
  // media-matched so the chrome follows the visitor's scheme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

// Resolved per request so a staging or preview host is never indexed; the
// rest of the metadata is static.
export async function generateMetadata(): Promise<Metadata> {
  let host: string | null = null;
  try { host = requestHost(headers()); } catch { /* outside a request: default rules */ }
  return deploymentIndexable(host)
    ? baseMetadata
    : { ...baseMetadata, robots: { index: false, follow: false } };
}

const baseMetadata: Metadata = {
  title: {
    default: "CapitalReach — Private Capital Marketplace",
    template: "%s | CapitalReach",
  },
  description:
    "Where early-stage founders raising capital meet investors deploying it. Browse, filter and back the next generation of companies on CapitalReach.",
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
    <html lang={locale} dir={rtl ? "rtl" : "ltr"} data-theme={theme} data-style={style} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Theme correction, BEFORE first paint. The server stamps the theme
            from the cr_theme cookie, but two visitors used to get dark
            wrongly: anyone with no cookie whose OS asks for light (the
            server cannot see prefers-color-scheme, so it defaulted hard to
            dark), and any statically-rendered shell (no cookies at build).
            This runs before CSS applies, so there is no flash: an explicit
            cookie choice ALWAYS wins; with no cookie, the visitor's system
            preference decides; dark stays the fallback when neither exists.
            html carries suppressHydrationWarning for exactly this. */}
        <script dangerouslySetInnerHTML={{ __html:
          `(function(){try{var d=document.documentElement,m=document.cookie.match(/(?:^|; )cr_theme=([^;]*)/),t;if(m){t=m[1]==="light"?"light":"dark"}else{t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}if(d.getAttribute("data-theme")!==t)d.setAttribute("data-theme",t);var s=document.cookie.match(/(?:^|; )cr_style=([^;]*)/),st=s&&s[1]==="editorial"?"editorial":"business";if(d.getAttribute("data-style")!==st)d.setAttribute("data-style",st)}catch(e){}})()`,
        }} />
        {/* First in head so the handshake overlaps the rest of the document.
            The client talks to Supabase from the first interactive moment
            (session, saved lists, sparklines), so pay the TLS setup early. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="" />
        )}
        {/* The four house families are self-hosted by next/font (lib/fonts.ts),
            so nothing in the head reaches fonts.googleapis.com any more.
            The per-locale face still does. Its CJK members are sliced into
            101-124 @font-face rules apiece, and next/font imports are static,
            so pulling all six of those families in would put roughly 330 KB of
            @font-face CSS into every route for every locale in order to spare
            six locales one request. The two origins are therefore warmed only
            on the locales that actually fetch from them. */}
        {extraFont && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link
              rel="stylesheet"
              href={`https://fonts.googleapis.com/css2?family=${extraFont.replace(/ /g, "+")}:wght@300;400;500;600;700&display=swap`}
            />
          </>
        )}
      </head>
      <body className="font-sans">
        {/* Seeds every client component with the server-resolved locale, so the
            first paint is already correct rather than English-then-swap. */}
        <LocaleProvider initialLocale={locale} initialMessages={messages}>
        {/* First stop in the tab order, so it cannot wait for anything. */}
        <SkipToContent />
        <DeferredBanner />
        {children}
        {/* Global shell. The Navbar is mounted per page, but this chrome is the
            same everywhere, so the layout is the one place it belongs. */}
        <DeferredChrome />
        {/* Server-rendered and empty: a filter that resolves before hydration
            still needs a region to announce into. */}
        <LiveRegion />
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
