import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { SuspendedActions } from "@/components/shared/suspended-actions";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account suspended — CapitalReach",
  robots: { index: false, follow: false },
};

export default async function SuspendedPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("suspended, account_status, suspended_reason, suspended_at, suspended_until")
    .eq("id", user.id)
    .maybeSingle();

  // Not actually suspended — don't strand them on a dead-end page.
  const suspended = !!profile?.suspended
    || profile?.account_status === "suspended"
    || profile?.account_status === "banned";
  if (!suspended) redirect("/dashboard");

  const banned = profile?.account_status === "banned";

  return (
    <>
      <Navbar />
      <main style={{
        background: "var(--cr-paper)", minHeight: "70vh",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "100px 24px 64px",
      }}>
        <div style={{
          maxWidth: "480px", width: "100%", background: "var(--cr-paper-2)",
          border: "1px solid var(--cr-rule-dark)", borderRadius: "8px",
          padding: "40px", textAlign: "center",
        }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "50%", margin: "0 auto 20px",
            background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "22px",
            color: "var(--cr-down)",
          }}>!</div>

          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700,
            fontSize: "28px", color: "var(--cr-ink)", letterSpacing: "-0.02em",
          }}>
            {banned ? "Your account has been closed" : "Your account has been suspended"}
          </h1>

          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px",
            color: "var(--cr-ink-3)", lineHeight: 1.65, marginTop: "14px",
          }}>
            {banned
              ? "Access to CapitalReach has been permanently revoked."
              : "Access to CapitalReach has been temporarily restricted."}
          </p>

          {profile?.suspended_reason && (
            <div style={{
              background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.15)",
              borderRadius: "6px", padding: "14px 16px", marginTop: "24px", textAlign: "left",
            }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
                color: "var(--cr-down)", textTransform: "uppercase", letterSpacing: "0.06em",
                marginBottom: "6px",
              }}>Reason</p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px",
                color: "var(--cr-ink-2)", lineHeight: 1.6,
              }}>{profile.suspended_reason}</p>
            </div>
          )}

          {profile?.suspended_until && !banned && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
              color: "var(--cr-ink-3)", marginTop: "14px",
            }}>
              Scheduled to lift on {formatDate(profile.suspended_until)}.
            </p>
          )}

          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px",
            color: "var(--cr-ink-4)", marginTop: "28px",
          }}>
            If you believe this is an error, contact us:
          </p>
          <a href="mailto:support@capitalreach.com" style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px",
            color: "var(--cr-copper)", textDecoration: "none",
          }}>support@capitalreach.com</a>

          <SuspendedActions />
        </div>
      </main>
      <Footer />
    </>
  );
}
