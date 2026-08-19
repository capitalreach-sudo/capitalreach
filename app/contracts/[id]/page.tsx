import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isTeamMemberOfEither } from "@/lib/membership";
import { maskIp } from "@/lib/identity";
import { formatMoney } from "@/lib/currency";
import { PrintButton } from "@/components/ui/PrintButton";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Executed contract", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * D38: the executed contract, with its signature certificate.
 *
 * Signing produced a row and a status badge and nothing a lawyer could
 * file. This is the document itself plus, beneath it, who signed, when, from
 * where (masked), and the SHA-256 of the exact text they agreed to — so a
 * later dispute can prove the terms were not edited after signature.
 *
 * Print-to-PDF rather than a generated file: no new dependency, every
 * browser can do it, and the page is the same artefact either way.
 */
export default async function ContractPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?redirect=/contracts/${params.id}`);

  const admin = createAdminClient();
  const { data: contract } = await admin
    .from("contracts")
    .select("*, startup:startups(name, slug, owner_id), investor:investors(display_name, firm_name, owner_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!contract) notFound();

  const st = contract.startup as unknown as { name: string; slug: string; owner_id: string } | null;
  const inv = contract.investor as unknown as { display_name: string | null; firm_name: string | null; owner_id: string | null } | null;

  // Participants only — plus admins, for support.
  let allowed = user.id === st?.owner_id || (!!inv?.owner_id && user.id === inv.owner_id);
  if (!allowed) allowed = await isTeamMemberOfEither(user.id, contract.startup_id, contract.investor_id);
  if (!allowed) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    allowed = prof?.role === "admin";
  }
  if (!allowed) notFound();

  const { data: signatures } = await admin
    .from("contract_signatures")
    .select("id, signer_name, signed_ip, created_at, content_hash")
    .eq("contract_id", contract.id)
    .order("created_at", { ascending: true });

  const t = await getTranslator(getLocale());
  const label: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cr-copper)", marginBottom: "4px" };
  const cell: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)" };

  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>
      <div style={{ maxWidth: "820px", margin: "0 auto", padding: "48px 32px 80px" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: "28px", flexWrap: "wrap" }}>
          <a href={`/deals?deal=${contract.deal_id}`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textDecoration: "none" }}>← {t("contracts.backToDeal")}</a>
          <PrintButton label={t("common.exportPdf")} />
        </div>

        <p style={label}>{contract.contract_type.replace(/_/g, " ")} · {contract.status}</p>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "30px", color: "var(--cr-ink)", letterSpacing: "-0.02em", marginBottom: "6px" }}>
          {contract.title}
        </h1>
        <p style={{ ...cell, color: "var(--cr-ink-3)", marginBottom: "26px" }}>
          {st?.name ?? "—"} &nbsp;·&nbsp; {inv?.display_name || inv?.firm_name || "—"}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "28px", paddingBottom: "22px", borderBottom: "1px solid var(--cr-rule)" }}>
          <div><p style={label}>{t("contracts.amount")}</p><p style={{ ...cell, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{contract.amount ? formatMoney(contract.amount, contract.currency) : "—"}</p></div>
          <div><p style={label}>{t("contracts.equity")}</p><p style={{ ...cell, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{contract.equity_percent != null ? `${contract.equity_percent}%` : "—"}</p></div>
          <div><p style={label}>{t("contracts.created")}</p><p style={{ ...cell, fontFamily: "'JetBrains Mono', monospace" }}>{new Date(contract.created_at).toLocaleDateString()}</p></div>
        </div>

        <div style={{ whiteSpace: "pre-wrap", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", lineHeight: 1.8, color: "var(--cr-ink-2)", marginBottom: "36px" }}>
          {contract.terms || t("contracts.noTerms")}
        </div>

        {/* ── Signature certificate ── */}
        <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", padding: "20px 22px", background: "var(--cr-paper-2)", pageBreakInside: "avoid" }}>
          <p style={label}>{t("contracts.certificate")}</p>
          {(signatures ?? []).length === 0 ? (
            <p style={{ ...cell, color: "var(--cr-ink-4)" }}>{t("contracts.unsigned")}</p>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {(signatures ?? []).map((sg) => (
                <div key={sg.id} style={{ display: "grid", gap: "3px", paddingBottom: "12px", borderBottom: "1px solid var(--cr-rule)" }}>
                  <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: "19px", color: "var(--cr-ink)" }}>{sg.signer_name}</p>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-3)" }}>
                    {new Date(sg.created_at).toISOString().replace("T", " ").slice(0, 19)} UTC · IP {maskIp(sg.signed_ip)}
                  </p>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", wordBreak: "break-all" }}>
                    SHA-256 {sg.content_hash}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11.5px", color: "var(--cr-ink-4)", marginTop: "12px", lineHeight: 1.55 }}>
            {t("contracts.certificateNote")}
          </p>
        </div>
      </div>
    </main>
  );
}
