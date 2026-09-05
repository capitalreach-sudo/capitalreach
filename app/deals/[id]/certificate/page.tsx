import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { formatMoney } from "@/lib/currency";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { Guilloche } from "@/components/ui/Guilloche";
import { WaxSeal } from "@/components/ui/WaxSeal";
import { CertPrintButton } from "@/components/deals/cert-print-button";

export const metadata = { title: "Certificate of Introduction", robots: { index: false } };

/**
 * The Certificate of Introduction: a closed deal, filed as a document.
 * Access rides the deal's own RLS -- only a party to the deal (owner, team,
 * admin) can load the row, so there is nothing extra to gate here. Printing
 * IS the download: the sheet is set at A4 proportions and the print styles
 * strip the chrome.
 */
export default async function CertificatePage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) {
    notFound();
  }
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?redirect=/deals/${params.id}/certificate`);

  const { data: deal } = await supabase
    .from("deals")
    .select("id, status, amount, currency, closed_at, startup:startups(name), investor:investors(display_name, firm_name)")
    .eq("id", params.id)
    .maybeSingle();

  if (!deal) notFound();
  if (deal.status !== "closed") redirect(`/deals?deal=${deal.id}`);

  const t = await getTranslator(getLocale());
  const startupRel = deal.startup as { name: string } | { name: string }[] | null;
  const investorRel = deal.investor as { display_name: string | null; firm_name: string | null } | Array<{ display_name: string | null; firm_name: string | null }> | null;
  const startupName = (Array.isArray(startupRel) ? startupRel[0]?.name : startupRel?.name) ?? "—";
  const inv = Array.isArray(investorRel) ? investorRel[0] : investorRel;
  const investorName = inv?.display_name || inv?.firm_name || "—";
  const ref = "CR–INTRO–" + String(parseInt(deal.id.replace(/-/g, "").slice(0, 6), 16) % 10000).padStart(4, "0");
  const closedDate = deal.closed_at ? new Date(deal.closed_at).toISOString().slice(0, 10) : "—";
  const amount = deal.amount ? formatMoney(Number(deal.amount), deal.currency || DEFAULT_CURRENCY) : "—";

  const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
  const label: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--cr-ink-4)" };

  return (
    <main style={{ minHeight: "100vh", background: "var(--cr-paper)", display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px" }}>
      {/* The sheet: A4 proportions on screen, true A4 in print. */}
      <div className="cert-sheet" style={{ position: "relative", width: "min(720px, 100%)", aspectRatio: "1 / 1.414", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", boxShadow: "var(--cr-card-shadow)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Guilloche frame band along the top edge, banknote-fashion. */}
        <div aria-hidden style={{ position: "absolute", top: "-120px", left: "-120px", right: "-120px", height: "320px", color: "var(--cr-copper)", pointerEvents: "none" }}>
          <Guilloche className="w-full h-full" seed={5} lines={20} opacity={0.07} />
        </div>
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", padding: "clamp(24px, 6vw, 56px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ ...mono, fontWeight: 600, fontSize: "9px", letterSpacing: "0.2em", color: "var(--cr-ink-4)" }}>CAPITALREACH</span>
            <span style={{ ...mono, fontWeight: 500, fontSize: "9px", letterSpacing: "0.14em", color: "var(--cr-ink-4)" }}>{ref}</span>
          </div>
          <div style={{ height: "1px", background: "var(--cr-rule)", margin: "16px 0 auto" }} />

          <div style={{ textAlign: "center", margin: "auto 0" }}>
            <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(26px, 5vw, 40px)", color: "var(--cr-ink)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "24px", textWrap: "balance" }}>
              {t("cert.title")}
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "clamp(13px, 2vw, 15px)", color: "var(--cr-ink-2)", lineHeight: 1.8, maxWidth: "46ch", margin: "0 auto" }}>
              {t("cert.body", { startup: startupName, investor: investorName })}
            </p>
          </div>

          <div style={{ marginTop: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", background: "var(--cr-rule)", border: "1px solid var(--cr-rule)", marginBottom: "28px" }}>
              {([[t("cert.amount"), amount], [t("cert.date"), closedDate], [t("cert.ref"), ref]] as const).map(([l, v]) => (
                <div key={l} style={{ background: "var(--cr-paper-2)", padding: "12px 14px" }}>
                  <div style={label}>{l}</div>
                  <div style={{ ...mono, fontWeight: 700, fontSize: "clamp(11px, 1.8vw, 14px)", color: "var(--cr-ink)", marginTop: "6px" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", maxWidth: "36ch", lineHeight: 1.6 }}>
                {t("cert.footer")}
              </p>
              <WaxSeal size={84} date={closedDate} />
            </div>
          </div>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "28px" }}>
        <CertPrintButton />
        <Link href={`/deals?deal=${deal.id}`} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", textDecoration: "none" }}>
          ← {t("common.back")}
        </Link>
      </div>
    </main>
  );
}
