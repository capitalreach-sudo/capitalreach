import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLocale, getTranslator } from "@/lib/locale-server";

/**
 * /onboarding -- the fork for an authenticated user whose profile has no role
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
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)", padding: "24px 16px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "var(--cr-copper)" }} />
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* House mark set as the ruled label -- matches the rest of the auth flow. */}
        <Link href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "32px", minHeight: "40px", textDecoration: "none" }}>
          <span className="ruled-label">CapitalReach</span>
        </Link>

        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px" }}>
          <div style={{ borderBottom: "1px solid var(--cr-rule)", marginBottom: "24px", paddingBottom: "16px" }}>
            <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("auth.joiningAs")}</div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)" }}>{t("auth.joinTitle")}</h1>
          </div>

          {/* Rule-separated rows with mono rails -- the ledger, not icon cards.
              Matches the signup role step. */}
          <div style={{ borderTop: "1px solid var(--cr-rule)" }}>
            {[
              { href: "/onboarding/startup?role=startup",   label: t("auth.startupFounder"), desc: t("auth.startupDesc") },
              { href: "/onboarding/investor?role=investor", label: t("auth.investor"),       desc: t("auth.investorDesc") },
            ].map(({ href, label, desc }, i) => (
              <Link key={href} href={href}
                style={{ display: "flex", alignItems: "center", gap: "16px", minHeight: "56px", padding: "12px 8px", textDecoration: "none", borderBottom: "1px solid var(--cr-rule)" }}>
                <span aria-hidden style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", display: "block", marginBottom: "4px" }}>{label}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", display: "block" }}>{desc}</span>
                </span>
                <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "14px", flexShrink: 0 }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
