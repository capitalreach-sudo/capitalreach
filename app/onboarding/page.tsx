import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Building2, TrendingUp } from "lucide-react";
import { getLocale, getTranslator } from "@/lib/locale-server";

/**
 * /onboarding — the fork for an authenticated user whose profile has no role
 * yet (Google sign-up lands here). Users with a role are sent straight to
 * their own onboarding; anonymous visitors to sign-up.
 */
export default async function OnboardingIndex() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signup");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "startup") redirect("/onboarding/startup");
  if (profile?.role === "investor") redirect("/onboarding/investor");
  if (profile?.role === "admin") redirect("/admin");

  const t = await getTranslator(getLocale());
  const card: React.CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px",
    padding: "26px 18px", borderRadius: "6px", border: "2px solid var(--cr-rule-dark)", background: "var(--cr-paper-2)",
    textDecoration: "none", color: "var(--cr-ink)",
  };
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: "520px" }}>
        <div className="ruled-label" style={{ marginBottom: "14px" }}>{t("auth.joiningAs")}</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "28px", color: "var(--cr-ink)", marginBottom: "22px" }}>{t("auth.joinTitle")}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "12px" }}>
          <Link href="/onboarding/startup?role=startup" style={card}>
            <Building2 style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px" }}>{t("auth.startupFounder")}</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("auth.startupDesc")}</span>
          </Link>
          <Link href="/onboarding/investor?role=investor" style={card}>
            <TrendingUp style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px" }}>{t("auth.investor")}</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("auth.investorDesc")}</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
