import { Cairo, DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";

/**
 * The four house families, self-hosted off the app's own origin.
 *
 * next/font hashes the family name it emits, so nothing in the app may name
 * these families directly. Every consumer reads the CSS variable instead, and
 * globals.css maps the literal names that ~1300 inline styles and the Tailwind
 * font-* utilities still write onto those variables. Renaming a variable here
 * means renaming it there in the same commit.
 *
 * `subsets` only decides which files get a <link rel="preload">. The whole
 * Google response is self-hosted either way, so every subset the browser could
 * ask for is still declared with its unicode-range, exactly as when the CSS
 * came from fonts.googleapis.com.
 */

// Every weight the site uses arrives in one variable file per subset, which is
// why no `weight` is listed: naming weights would pin this to static instances
// and bill one file each.
export const dmSans = DM_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-dm-sans",
  fallback: ["system-ui", "sans-serif"],
});

// The display axes are load-bearing: globals.css sets 'opsz' 144, 'SOFT' 0/50
// and 'WONK' 0/1 through font-variation-settings, and an axis left out of this
// list is absent from the file, which pins it to its default with no warning.
export const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
  // The business style resolves --font-serif to the sans, and business is the
  // default register, so most sessions never paint a serif glyph. Preloading
  // would spend ~120 KB up front for those sessions.
  preload: false,
  variable: "--font-fraunces",
  fallback: ["Georgia", "serif"],
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  // Mono is figures and small labels, never the first thing on screen.
  preload: false,
  variable: "--font-jetbrains-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

// Arabic only, behind Noto Sans Arabic in the [dir="rtl"] stack. The @font-face
// rules ride along on every route because the import is static, but the files
// themselves are fetched only when something actually resolves to this family,
// so the other fourteen locales pay nothing over the wire.
export const cairo = Cairo({
  subsets: ["arabic"],
  display: "swap",
  preload: false,
  variable: "--font-cairo",
  fallback: ["system-ui", "sans-serif"],
});

/** Belongs on <html>: :root is where globals.css reads these variables. */
export const fontVariables = [
  dmSans.variable,
  fraunces.variable,
  jetBrainsMono.variable,
  cairo.variable,
].join(" ");
