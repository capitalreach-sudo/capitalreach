import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { DisclosureLog } from "@/components/startup/disclosure-log";
import { getLocale, getTranslator } from "@/lib/locale-server";

/**
 * The founder's confidentiality record: every NDA signed on their listing, the
 * wording each counterparty agreed to, and what each of them opened afterwards.
 *
 * Server component so the bounce happens before anything renders -- this is a
 * record of other parties' obligations, and the wrong person must never see the
 * shape of the page, let alone its contents. The route behind it enforces
 * ownership again on its own; neither check trusts the other.
 */
export default async function NdaRecordPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "startup") {
    redirect(profile?.role === "admin" ? "/admin" : "/dashboard/investor");
  }

  // Owner verified above; the service role sees past the column grants.
  const { data: startup } = await createAdminClient()
    .from("startups")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("status", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!startup) redirect("/onboarding/startup");

  const t = await getTranslator(getLocale());

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "100vh", paddingBottom: "64px" }}>
        <div style={{ maxWidth: "672px", margin: "0 auto", padding: "40px 24px" }}>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
            <Link
              href="/dashboard/startup/documents"
              style={{
                display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "40px",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
                color: "var(--cr-ink-4)", textDecoration: "none",
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} aria-hidden /> {t("common.back")}
            </Link>
            <div style={{ width: 1, height: 14, background: "var(--cr-rule-dark)" }} aria-hidden />
            <h1 style={{
              fontFamily: "var(--font-serif)", fontWeight: 700, fontStyle: "italic",
              fontSize: "clamp(22px, 4vw, 28px)", color: "var(--cr-ink)", letterSpacing: "-0.02em",
            }}>
              {t("discLog.title")}
            </h1>
          </div>

          <p style={{
            fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
            fontWeight: 500, fontSize: "11px", letterSpacing: "0.02em",
            color: "var(--cr-ink-4)", marginBottom: "32px",
          }}>
            {startup.name}
          </p>

          <DisclosureLog />
        </div>
      </main>
    </>
  );
}
