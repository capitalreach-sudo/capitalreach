"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { authErrorMessage } from "@/lib/auth-errors";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * /auth/verify-email?email=… — the "check your inbox" screen as its own
 * route, so a sign-in attempt on an unconfirmed account (and any email link)
 * can land here rather than on a dead end. Resend is throttled client-side
 * (60s) on top of Supabase's own limits; the page polls the session and moves
 * on by itself once the link has been clicked in another tab.
 */
function VerifyEmailInner() {
  const { t } = useTranslation();
  const sp = useSearchParams();
  const router = useRouter();
  const email = (sp.get("email") ?? "").trim();
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  // Auto-advance: when the confirmation link is opened elsewhere the session
  // becomes valid here too; check on focus and every 5s.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancelled && user?.email_confirmed_at) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        router.replace(p?.role === "startup" ? "/onboarding/startup" : p?.role === "investor" ? "/onboarding/investor" : "/onboarding");
      }
    }
    check();
    const id = setInterval(check, 5000);
    window.addEventListener("focus", check);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener("focus", check); };
  }, [router, supabase]);

  async function handleResend() {
    if (!email || resendIn > 0 || resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    setResending(false);
    if (error) { notify.error(authErrorMessage(error, t)); return; }
    notify.success(t("auth.resendSent"));
    setResendIn(60);
  }

  const steps = [t("auth.confirmStep1"), t("auth.confirmStep2")];

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)", padding: "24px 16px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "var(--cr-copper)" }} />
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <Link href="/" style={{ display: "flex", justifyContent: "center", marginBottom: "24px", textDecoration: "none", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "18px", color: "var(--cr-ink)" }}>
          <span style={{ color: "var(--cr-copper)", marginRight: 8 }}>◆</span>CapitalReach
        </Link>
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <Mail style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("auth.checkInbox")}</h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6, marginBottom: "24px" }}>
            {t("auth.verifyEmailSent")}{" "}
            {email ? <strong style={{ fontWeight: 500, color: "var(--cr-ink)" }}>{email}</strong> : <span>{t("auth.email").toLowerCase()}</span>}.
          </p>

          <div style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "16px", marginBottom: "20px", textAlign: "left" }}>
            {steps.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderBottom: i < steps.length - 1 ? "1px solid var(--cr-rule)" : "none" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "10px", color: "var(--cr-copper)" }}>{i + 1}</span>
                </div>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{item}</span>
              </div>
            ))}
          </div>

          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "12px" }}>
            {t("auth.didntReceive")}{" "}
            <button onClick={handleResend} disabled={!email || resendIn > 0 || resending}
              style={{ background: "none", border: "none", cursor: !email || resendIn > 0 || resending ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: !email || resendIn > 0 || resending ? "var(--cr-ink-4)" : "var(--cr-copper)", textDecoration: !email || resendIn > 0 || resending ? "none" : "underline" }}>
              {resending ? t("auth.resending") : resendIn > 0 ? t("auth.resendIn", { n: resendIn }) : t("auth.resendEmail")}
            </button>
            {" · "}
            <Link href="/auth/signup" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-copper)", textDecoration: "underline" }}>
              {t("auth.tryDifferentEmail")}
            </Link>
          </p>
          <Link href="/auth/login" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "40px", borderRadius: "4px", border: "1px solid var(--cr-rule-dark)", background: "transparent", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)", textDecoration: "none", boxSizing: "border-box" }}>
            {t("auth.goToSignIn")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--cr-paper)" }} />}>
      <VerifyEmailInner />
    </Suspense>
  );
}
