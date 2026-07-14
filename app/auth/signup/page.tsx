"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { Building2, User, Mail, AlertTriangle, ExternalLink, TrendingUp } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

type Role = "startup" | "investor";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isSupabaseConfigured =
  Boolean(SUPABASE_URL) && !SUPABASE_URL.includes("placeholder") && SUPABASE_URL.startsWith("https://");

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

const Logo = () => (
  <Link href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "36px", textDecoration: "none" }}>
    <div style={{ width: 28, height: 28, background: "var(--cr-copper)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <TrendingUp style={{ width: 14, height: 14, color: "#fff" }} />
    </div>
    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "15px", color: "var(--cr-copper)", letterSpacing: "-0.02em" }}>CapitalReach</span>
  </Link>
);

export default function SignupPage() {
  const { t } = useTranslation();
  const [step, setStep]         = useState<"role" | "details" | "confirm">("role");
  const [role, setRole]         = useState<Role | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [signupError, setSignupError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return;
    setLoading(true); setSignupError("");
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName, role }, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) { setSignupError(error.message); setLoading(false); return; }
      if (!data.user) { setSignupError(t("auth.signupFailed")); setLoading(false); return; }
      if (data.session) {
        fetch("/api/auth/welcome", { method: "POST" }).catch(() => {});
        notify.success(t("auth.welcomeToast"));
        router.push(`/onboarding/${role}`);
      } else { setStep("confirm"); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("auth.unexpectedError");
      setSignupError(msg.includes("fetch") ? t("auth.serverUnreachable") : msg);
    }
    setLoading(false);
  }

  async function handleGoogleSignup() {
    if (!role) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { role } },
    });
  }

  const pageWrap = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)", padding: "24px 16px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "var(--cr-copper)" }} />
      {children}
    </div>
  );

  const SetupBanner = () => (
    <div style={{ marginBottom: "16px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <AlertTriangle style={{ width: 14, height: 14, color: "var(--cr-copper)", flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("auth.supabaseNotConfigured")}</p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", marginBottom: "8px", lineHeight: 1.5 }}>
            {t("auth.supabaseSetupNote")}
          </p>
          <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 500, color: "var(--cr-copper)", textDecoration: "none" }}>
            {t("auth.openSupabase")} <ExternalLink style={{ width: 11, height: 11 }} />
          </a>
        </div>
      </div>
    </div>
  );

  const Divider = () => (
    <div style={{ position: "relative", margin: "20px 0" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
        <div style={{ width: "100%", borderTop: "1px solid var(--cr-rule)" }} />
      </div>
      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        <span style={{ background: "var(--cr-paper-2)", padding: "0 12px", fontFamily: "'DM Sans', sans-serif", fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("auth.or")}</span>
      </div>
    </div>
  );

  const GoogleButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}
      style={{ width: "100%", height: "44px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "border-color 120ms" }}
      onMouseEnter={e => !disabled && ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}>
      <svg style={{ height: 16, width: 16 }} viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      {t("auth.continueGoogle")}
    </button>
  );

  // ── Confirm step ─────────────────────────────────────────────
  if (step === "confirm") {
    const confirmSteps = [
      t("auth.confirmStep1"),
      t("auth.confirmStep2"),
      t("auth.confirmStep3", { role: role ?? "" }),
      t("auth.confirmStep4", { connect: role === "investor" ? t("auth.startups") : t("auth.investors") }),
    ];
    return pageWrap(
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <Logo />
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <Mail style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("auth.checkInbox")}</h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6, marginBottom: "24px" }}>
            {t("auth.verifyEmailSent")} <strong style={{ fontWeight: 500, color: "var(--cr-ink)" }}>{email}</strong>.
          </p>

          <div style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "16px", marginBottom: "20px", textAlign: "left" }}>
            {confirmSteps.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderBottom: i < 3 ? "1px solid var(--cr-rule)" : "none" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "10px", color: "var(--cr-copper)" }}>{i + 1}</span>
                </div>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{item}</span>
              </div>
            ))}
          </div>

          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "12px" }}>
            {t("auth.didntReceive")}{" "}
            <button onClick={() => { setStep("details"); setSignupError(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-copper)", textDecoration: "underline" }}>
              {t("auth.tryDifferentEmail")}
            </button>
          </p>
          <Link href="/auth/login">
            <button style={{ width: "100%", height: "40px", borderRadius: "4px", border: "1px solid var(--cr-rule-dark)", background: "transparent", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
              {t("auth.goToSignIn")}
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Role selection ────────────────────────────────────────────
  if (step === "role") {
    return pageWrap(
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <Logo />
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px" }}>
          {!isSupabaseConfigured && <SetupBanner />}
          <div style={{ borderBottom: "3px solid var(--cr-copper)", marginBottom: "24px", paddingBottom: "20px" }}>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("auth.joinTitle")}</h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("auth.joiningAs")}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
            {([
              { value: "startup",  label: t("auth.startupFounder"), icon: Building2, desc: t("auth.startupDesc") },
              { value: "investor", label: t("auth.investor"),        icon: User,      desc: t("auth.investorDesc") },
            ] as { value: Role; label: string; icon: React.ElementType; desc: string }[]).map(opt => {
              const Icon = opt.icon;
              const active = role === opt.value;
              return (
                <button key={opt.value} onClick={() => setRole(opt.value)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "18px 12px", borderRadius: "4px", border: `2px solid ${active ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`, background: active ? "var(--cr-copper-bg)" : "var(--cr-paper-3)", cursor: "pointer", transition: "border-color 120ms, background 120ms" }}>
                  <Icon style={{ width: 24, height: 24, marginBottom: "10px", color: active ? "var(--cr-copper)" : "var(--cr-ink-4)", strokeWidth: 1.5 }} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", display: "block", marginBottom: "2px" }}>{opt.label}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{opt.desc}</span>
                </button>
              );
            })}
          </div>

          <button className="btn-copper-shimmer" style={{ ...primaryBtn, opacity: !role ? 0.4 : 1, cursor: !role ? "not-allowed" : "pointer" }}
            disabled={!role} onClick={() => setStep("details")}>
            {t("auth.continue")}
          </button>

          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textAlign: "center", marginTop: "16px" }}>
            {t("auth.haveAccount")}{" "}
            <Link href="/auth/login" style={{ color: "var(--cr-copper)", textDecoration: "none", fontWeight: 500 }}>{t("auth.signIn")}</Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Details step ──────────────────────────────────────────────
  return pageWrap(
    <div style={{ width: "100%", maxWidth: "400px" }}>
      <Logo />
      <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px" }}>
        {!isSupabaseConfigured && <SetupBanner />}

        <button onClick={() => { setStep("role"); setSignupError(""); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-copper)", marginBottom: "16px", padding: 0 }}>
          ← {t("common.back")}
        </button>

        <div style={{ borderBottom: "3px solid var(--cr-copper)", marginBottom: "24px", paddingBottom: "20px" }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("auth.createAccount")}</h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>
            {t("auth.joiningAsRole")} <span style={{ color: "var(--cr-copper)", fontWeight: 500, textTransform: "capitalize" }}>{role}</span>
          </p>
        </div>

        {signupError && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: "var(--cr-down-bg)", border: "1px solid rgba(185,28,28,0.2)", borderRadius: "4px", padding: "12px 14px", marginBottom: "16px" }}>
            <AlertTriangle style={{ width: 14, height: 14, color: "var(--cr-down)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-down)" }}>{signupError}</p>
          </div>
        )}

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {([
            { id: "name",     label: t("auth.fullName"), type: "text",     placeholder: "Jane Smith",       value: fullName, onChange: setFullName, minLength: undefined as number | undefined },
            { id: "email",    label: t("auth.email"),    type: "email",    placeholder: "jane@startup.com", value: email,    onChange: setEmail,    minLength: undefined as number | undefined },
            { id: "password", label: t("auth.password"), type: "password", placeholder: t("auth.passwordHint"), value: password, onChange: setPassword, minLength: 8 as number | undefined },
          ]).map(({ id, label, type, placeholder, value, onChange, minLength }) => (
            <div key={id}>
              <label htmlFor={id} style={labelSt}>{label}</label>
              <input id={id} type={type} placeholder={placeholder} value={value}
                onChange={e => onChange(e.target.value)} required minLength={minLength}
                onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
            </div>
          ))}
          <button type="submit" disabled={loading || !isSupabaseConfigured} className="btn-copper-shimmer"
            style={{ ...primaryBtn, opacity: loading || !isSupabaseConfigured ? 0.5 : 1, cursor: loading || !isSupabaseConfigured ? "not-allowed" : "pointer", marginTop: "4px" }}>
            {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
          </button>
        </form>

        <Divider />
        <GoogleButton onClick={handleGoogleSignup} disabled={!isSupabaseConfigured} />

        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)", textAlign: "center", marginTop: "16px", lineHeight: 1.6 }}>
          {t("auth.termsAgreement")}{" "}
          <Link href="/terms" style={{ color: "var(--cr-copper)", textDecoration: "none" }}>{t("auth.terms")}</Link>{" "}
          {t("auth.and")}{" "}
          <Link href="/privacy" style={{ color: "var(--cr-copper)", textDecoration: "none" }}>{t("auth.privacy")}</Link>.{" "}
          {t("auth.feeNote")}
        </p>
      </div>
    </div>
  );
}
