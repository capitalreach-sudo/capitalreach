import Link from "next/link";
import { Guilloche } from "@/components/ui/Guilloche";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { getLocale, getTranslator } from "@/lib/locale-server";

// The one decorative glyph the house permits.
function DiamondDot() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" style={{ flexShrink: 0 }} aria-hidden>
      <path d="M3 0L6 3L3 6L0 3L3 0Z" fill="var(--cr-copper)" />
    </svg>
  );
}

export default async function NotFound() {
  const t = await getTranslator(getLocale());
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--cr-paper)" }}>
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="w-full max-w-[560px] flex flex-col items-center text-center">
          {/* House mark, set as the ruled label */}
          <div className="ruled-label" style={{ justifyContent: "center", marginBottom: "32px" }}>
            CR
          </div>

          {/* The number is the moment: the site's largest type, set in the
              serif with WONK on, over guilloche -- a misprint from a fine
              print shop, not an error screen. */}
          <div style={{ position: "relative", display: "inline-block" }}>
            <div aria-hidden style={{ position: "absolute", inset: "-30%", color: "var(--cr-copper)", pointerEvents: "none" }}>
              <Guilloche className="w-full h-full" seed={11} lines={14} opacity={0.1} />
            </div>
            <p
              aria-hidden
              className="select-none display-wonk"
              style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 700,
                fontStyle: "italic",
                fontSize: "clamp(120px, 28vw, 220px)",
                fontVariantNumeric: "tabular-nums",
                color: "var(--cr-ink)",
                lineHeight: 1,
                letterSpacing: "-0.06em",
                position: "relative",
              }}
            >
              404
            </p>
          </div>

          {/* Ledger line, broken by the diamond */}
          <div
            aria-hidden
            style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", maxWidth: "280px", margin: "32px 0" }}
          >
            <span style={{ flex: 1, height: "1px", background: "var(--cr-rule)" }} />
            <DiamondDot />
            <span style={{ flex: 1, height: "1px", background: "var(--cr-rule)" }} />
          </div>

          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 700,
              fontStyle: "italic",
              fontSize: "clamp(30px, 5vw, 44px)",
              color: "var(--cr-ink)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              textWrap: "balance",
            }}
          >
            {t("notFound.title")}
          </h1>

          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: "14px",
              color: "var(--cr-ink-3)",
              lineHeight: 1.65,
              maxWidth: "44ch",
              marginTop: "16px",
            }}
          >
            {t("notFound.body")}
          </p>

          {/* One quiet way home; the browse link is quieter still */}
          <div
            className="flex flex-col sm:flex-row items-center justify-center"
            style={{ gap: "12px 32px", marginTop: "32px" }}
          >
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                minHeight: "40px",
                padding: "8px 4px",
                textDecoration: "none",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                fontSize: "14px",
                color: "var(--cr-copper)",
              }}
            >
              {t("notFound.goHome")} <span aria-hidden>→</span>
            </Link>
            <Link
              href="/startups"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "40px",
                padding: "8px 4px",
                textDecoration: "none",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 400,
                fontSize: "13px",
                color: "var(--cr-ink-3)",
              }}
            >
              {t("notFound.browse")}
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
