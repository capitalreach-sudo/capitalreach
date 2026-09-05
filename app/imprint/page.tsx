import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { legalEntity, legalEntityConfigured } from "@/lib/brand";

// The whole body is rendered on the SERVER with getTranslator(getLocale()),
// and the locale comes from a cookie. force-static prerendered it once at
// build time, where there is no cookie, so every non-English visitor got this
// page in English permanently (a client cannot re-render a server component).
// Rendered per request instead, so the cookie language is honoured.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslator(getLocale());
  return {
    title: t("imprint.metaTitle"),
    description: t("imprint.metaDesc"),
    // Nothing to index until it carries real details.
    ...(legalEntityConfigured ? {} : { robots: { index: false } }),
  };
}

// Ledger row: Label over value, split from its neighbours by hairlines --
// registered-entity facts read as entries, not a boxed card. Register and
// VAT numbers are data, so they set in mono.
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div style={{ borderTop: "1px solid var(--cr-rule)", padding: "16px 0" }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
        {label}
      </p>
      <p
        className="whitespace-pre-line"
        style={
          mono
            ? { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", lineHeight: 1.7 }
            : { fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", color: "var(--cr-ink)", lineHeight: 1.7 }
        }
      >
        {value}
      </p>
    </div>
  );
}

export default async function ImprintPage() {
  const t = await getTranslator(getLocale());

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--cr-paper)" }}>
      <Navbar />

      <main className="mx-auto w-full px-6 md:px-10 py-16 md:py-24 max-w-3xl flex-1">
        {/* Header -- ruled-label opener, serif italic display. */}
        <header style={{ marginBottom: "48px" }}>
          <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("privacy.legalLabel")}</div>
          <h1
            style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(30px, 5vw, 44px)",
              color:         "var(--cr-ink)",
              lineHeight:    1.08,
              letterSpacing: "-0.02em",
              textWrap:      "balance",
              marginBottom:  "12px",
            }}
          >
            {t("imprint.title")}
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.7 }}>
            {t("imprint.subtitle")}
          </p>
        </header>

        {legalEntityConfigured ? (
          <div style={{ borderBottom: "1px solid var(--cr-rule)" }}>
            <Row label={t("imprint.provider")} value={legalEntity.name} />
            <Row label={t("imprint.address")} value={legalEntity.address} />
            <Row label={t("imprint.representedBy")} value={legalEntity.managing} />
            <Row label={t("imprint.contact")} value={[legalEntity.email, legalEntity.phone].filter(Boolean).join("\n")} mono />
            <Row label={t("imprint.register")} value={legalEntity.register} mono />
            <Row label={t("imprint.vatId")} value={legalEntity.vatId} mono />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", lineHeight: 1.65, borderTop: "1px solid var(--cr-rule)", padding: "16px 0" }}>
              {t("imprint.euDispute")}
            </p>
          </div>
        ) : (
          /* Empty state: one diamond, one sentence -- no box. */
          <div className="text-center" style={{ borderTop: "1px solid var(--cr-rule)", borderBottom: "1px solid var(--cr-rule)", padding: "64px 24px" }}>
            <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "16px", display: "block", marginBottom: "12px" }}>✦</span>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("imprint.pendingTitle")}</p>
            <p className="max-w-md mx-auto" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.7 }}>
              {t("imprint.pendingBody")}
            </p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
