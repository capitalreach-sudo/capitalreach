"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { Eye, EyeOff, TrendingUp } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { authErrorMessage } from "@/lib/auth-errors";

const iStyle: React.CSSProperties = {
  width: "100%", height: "44px", borderRadius: "3px",
  border: "1px solid var(--cr-rule-dark)",
  background: "var(--cr-paper-3)", padding: "0 12px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300,
  fontSize: "14px", color: "var(--cr-ink)", outline: "none",
  boxSizing: "border-box", transition: "border-color 150ms",
};
const labelSt: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase",
  letterSpacing: "0.08em", display: "block", marginBottom: "6px",
};
const primaryBtn: React.CSSProperties = {
  width: "100%", height: "44px", borderRadius: "4px",
  background: "var(--cr-copper)", color: "#fff",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
  fontSize: "14px", border: "none", cursor: "pointer",
  transition: "opacity 120ms",
};

function onFocusCopper(e: React.FocusEvent<HTMLInputElement>) {
  (e.target as HTMLElement).style.borderColor = "var(--cr-copper)";
}
function onBlurRule(e: React.FocusEvent<HTMLInputElement>) {
  (e.target as HTMLElement).style.borderColor = "var(--cr-rule-dark)";
}

function LoginForm() {
  const { t } = useTranslation();
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  // Set when the account has a verified TOTP factor: password sign-in stopped
  // at AAL1 and the dashboard stays locked until the code is verified.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode]         = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // An unconfirmed address is not a wrong password: send them to the
      // verify screen (with resend) instead of a toast they cannot act on.
      if (/email not confirmed|email_not_confirmed/i.test(error.message)) {
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        notify.error(authErrorMessage(error, t));
      }
    } else {
      // 2FA gate. With a verified factor, the session issued by the password
      // alone is AAL1 -- middleware and RLS see it as not-fully-authenticated
      // -- so this is a real gate, not a UI courtesy: skipping the prompt
      // would leave a half-session, not an open door.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
        const { data: fs } = await supabase.auth.mfa.listFactors();
        const factor = fs?.totp?.find((f) => f.status === "verified");
        if (factor) {
          setMfaFactorId(factor.id);
          setLoading(false);
          return;
        }
      }
      await finishLogin(data.user!.id);
    }
    setLoading(false);
  }

  // Already signed in? "Sign in" links survive all over the site (and
  // "List your startup" buttons point at auth for anonymous visitors) — a
  // logged-in click should land home, not on a login form.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) void finishLogin(user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finishLogin(userId: string) {
    // Fire-and-forget is safe here: this is the browser, not a lambda, and a
    // lost history row must never block a sign-in.
    fetch("/api/account/logins", { method: "POST" }).catch(() => {});
    notify.success(t("auth.welcomeRedirect"));
    if (redirect && redirect !== "/") {
      router.push(redirect); router.refresh();
    } else {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
      const role = profile?.role;
      // No role yet (e.g. Google sign-up that never finished) → the role
      // fork, not the homepage.
      router.push(role === "startup" ? "/dashboard/startup" : role === "investor" ? "/dashboard/investor" : role === "admin" ? "/admin" : "/onboarding");
      router.refresh();
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId || mfaCode.length < 6) return;
    setLoading(true);
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (chErr || !challenge) { setLoading(false); notify.error(t("twofa.wrongCode")); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode });
    if (error) { setLoading(false); notify.error(t("twofa.wrongCode")); setMfaCode(""); return; }
    const { data: { user } } = await supabase.auth.getUser();
    setLoading(false);
    if (user) await finishLogin(user.id);
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}` },
    });
  }

  return (
    <div style={{ width: "100%", maxWidth: "400px" }}>
      {/* Logo */}
      <Link href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "40px", textDecoration: "none" }}>
        <div style={{ width: 28, height: 28, background: "var(--cr-copper)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <TrendingUp style={{ width: 14, height: 14, color: "#fff" }} />
        </div>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "15px", color: "var(--cr-copper)", letterSpacing: "-0.02em" }}>CapitalReach</span>
      </Link>

      {/* Card */}
      <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px" }}>
        <div style={{ borderBottom: "3px solid var(--cr-copper)", marginBottom: "24px", paddingBottom: "20px" }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "26px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("auth.welcomeBack")}</h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("auth.signInSub")}</p>
        </div>

        {mfaFactorId ? (
          <form onSubmit={handleMfaVerify} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
              {t("twofa.loginPrompt")}
            </p>
            <input
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoFocus placeholder="000000" aria-label={t("twofa.codeLabel")}
              style={{ width: "100%", boxSizing: "border-box", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'JetBrains Mono', monospace", fontSize: "22px", letterSpacing: "0.35em", color: "var(--cr-ink)", padding: "12px", outline: "none", textAlign: "center" }}
            />
            <button type="submit" disabled={loading || mfaCode.length < 6} className="btn-copper-shimmer"
              style={{ ...primaryBtn, opacity: loading || mfaCode.length < 6 ? 0.6 : 1 }}>
              {loading ? t("twofa.checking") : t("twofa.verify")}
            </button>
            <button type="button"
              onClick={async () => { await supabase.auth.signOut(); setMfaFactorId(null); setMfaCode(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-4)", textDecoration: "underline", textUnderlineOffset: "2px" }}>
              {t("twofa.backToLogin")}
            </button>
          </form>
        ) : (
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelSt}>{t("auth.email")}</label>
            <input type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} required autoComplete="email"
              onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <label style={{ ...labelSt, marginBottom: 0 }}>{t("auth.password")}</label>
              <Link href="/auth/reset-password" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-copper)", textDecoration: "none" }}>{t("auth.forgotPassword")}</Link>
            </div>
            <div style={{ position: "relative" }}>
              <input type={showPassword ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
                onFocus={onFocusCopper} onBlur={onBlurRule}
                style={{ ...iStyle, paddingRight: "40px" }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", padding: 0 }}>
                {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-copper-shimmer" style={{ ...primaryBtn, opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer", marginTop: "4px" }}>
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>
        )}

        {!mfaFactorId && (
        <>
        <div style={{ position: "relative", margin: "20px 0" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
            <div style={{ width: "100%", borderTop: "1px solid var(--cr-rule)" }} />
          </div>
          <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
            <span style={{ background: "var(--cr-paper-2)", padding: "0 12px", fontFamily: "'DM Sans', sans-serif", fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("auth.or")}</span>
          </div>
        </div>

        <button onClick={handleGoogleLogin}
          style={{ width: "100%", height: "44px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", cursor: "pointer", transition: "border-color 120ms" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"}>
          <svg style={{ height: 16, width: 16 }} viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {t("auth.continueGoogle")}
        </button>
        </>
        )}

        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textAlign: "center", marginTop: "20px" }}>
          {t("auth.noAccount")}{" "}
          <Link href="/auth/signup" style={{ color: "var(--cr-copper)", textDecoration: "none", fontWeight: 500 }}>{t("auth.signUp")}</Link>
        </p>
      </div>

      <div style={{ marginTop: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        {[t("auth.trustSsl"), t("auth.trustSecurity"), t("auth.trustFee")].map((item, i, arr) => (
          <span key={item} style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{item}</span>
            {i < arr.length - 1 && <span style={{ width: 1, height: 10, background: "var(--cr-rule-dark)" }} />}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)", padding: "24px 16px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "var(--cr-copper)" }} />
      <Suspense fallback={
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <div style={{ height: "28px", background: "var(--cr-paper-3)", borderRadius: "3px", marginBottom: "40px", width: "160px", margin: "0 auto 40px" }} />
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px" }}>
            <div style={{ height: "26px", background: "var(--cr-paper-3)", borderRadius: "3px", marginBottom: "24px", width: "60%" }} />
            <div style={{ height: "44px", background: "var(--cr-paper-3)", borderRadius: "3px", marginBottom: "12px" }} />
            <div style={{ height: "44px", background: "var(--cr-paper-3)", borderRadius: "3px", marginBottom: "20px" }} />
            <div style={{ height: "44px", background: "var(--cr-copper-bg)", borderRadius: "4px" }} />
          </div>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
