"use client";

import { useState, useEffect, Suspense } from "react";
import { isPasswordBreached } from "@/lib/password-check";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FOUNDER_PLANS, INVESTOR_PLANS,
  type FounderPlanId, type InvestorPlanId,
} from "@/lib/plans";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { Building2, User, Mail, AlertTriangle, ExternalLink, TrendingUp } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { authErrorMessage } from "@/lib/auth-errors";

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

function SignupForm() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();

  // /pricing sends ?plan=growth&role=startup. Both are untrusted URL input, so
  // neither is used for anything but display and a pre-selection the user can
  // still change -- entitlement comes from the DB, never from a query string.
  const planParam = searchParams.get("plan");
  const inviteParam = (searchParams.get("invite") ?? "").trim().toUpperCase();
  const roleParam = searchParams.get("role");
  const presetRole: Role | null =
    roleParam === "startup" || roleParam === "investor" ? roleParam : null;
  const presetPlan =
    presetRole === "startup"
      ? FOUNDER_PLANS[planParam as FounderPlanId] ?? null
      : presetRole === "investor"
        ? INVESTOR_PLANS[planParam as InvestorPlanId] ?? null
        : null;

  // Arriving from a plan card means the role question is already answered --
  // asking it again makes the click look like it did nothing.
  const [step, setStep]         = useState<"role" | "details" | "confirm">(presetRole ? "details" : "role");
  const [role, setRole]         = useState<Role | null>(presetRole);
  const [fullName, setFullName] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  // Seconds until the resend link re-enables. Supabase rate limits resends
  // server-side; the countdown makes that visible rather than letting someone
  // click into an opaque error.
  const [resendIn, setResendIn]   = useState(0);
  const [signupError, setSignupError] = useState("");
  // F: who sent you here. Looked up rather than trusted from the URL — the
  // code decides the role, so a link cannot be edited into a different one.
  const [invite, setInvite] = useState<{ valid: boolean; role?: string; inviterName?: string | null } | null>(null);
  // Terms §1 says use constitutes acceptance, which is weak. Require an
  // explicit act and record when it happened.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed]   = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  // Password strength: length + character classes, 0–4. Purely advisory —
  // the breach check below is the real gate.
  const strength = (() => {
    let sc = 0;
    if (password.length >= 8) sc++;
    if (password.length >= 12) sc++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) sc++;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) sc++;
    return password ? Math.max(1, sc) : 0;
  })();
  const strengthLabel = [null, t("auth.strengthWeak"), t("auth.strengthFair"), t("auth.strengthStrong"), t("auth.strengthVeryStrong")][strength];
  const strengthColor = ["transparent", "var(--cr-down)", "#B8860B", "var(--cr-copper)", "var(--cr-up)"][strength];
  const passwordsMatch = confirmPassword.length === 0 || confirmPassword === password;
  const canSubmit = termsAccepted && ageConfirmed && password.length >= 8 && confirmPassword === password;
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return;
    if (!termsAccepted) { setSignupError(t("auth.mustAcceptTerms")); return; }
    if (!ageConfirmed) { setSignupError(t("auth.mustConfirmAge")); return; }
    if (confirmPassword !== password) { setSignupError(t("auth.passwordsMismatch")); return; }
    setLoading(true); setSignupError("");
    try {
      // k-anonymity breach check (lib/password-check): only five hex chars of
      // a local SHA-1 ever leave the device, and the check fails open, so a
      // HIBP outage cannot block registration. Blocking rather than warning:
      // a password seen in breaches WILL be in credential-stuffing lists,
      // and this platform holds deal financials.
      const { breached, count } = await isPasswordBreached(password);
      if (breached) {
        setSignupError(t("auth.passwordBreached", { count }));
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: {
            full_name: fullName, role,
            terms_accepted_at: new Date().toISOString(),
            age_confirmed_at: new Date().toISOString(),
            // Which plan they clicked, so the intent survives signup and is
            // there when launch pricing ends. Deliberately in user_metadata
            // rather than a profiles column: it is a record of what they
            // *wanted*, not an entitlement, and it needs no migration.
            ...(presetPlan ? { intended_plan: presetPlan.id } : {}),
            // F: carried through signup so the invite can be redeemed once
            // the account exists. Metadata rather than a column for the same
            // reason as intended_plan — it is a record of how they arrived.
            ...(invite?.valid ? { invite_code: inviteParam } : {}),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { setSignupError(authErrorMessage(error, t)); setLoading(false); return; }
      if (!data.user) { setSignupError(t("auth.signupFailed")); setLoading(false); return; }
      // With email confirmation on, Supabase answers an EXISTING email with a
      // fake success (a user object with no identities) instead of an error —
      // deliberate enumeration protection on their side, but on ours it sent
      // people to "check your inbox" for a mail that never comes. An empty
      // identities array is the documented tell.
      if (!data.session && (data.user.identities?.length ?? 0) === 0) {
        setSignupError(t("authErrors.alreadyRegistered"));
        setLoading(false);
        return;
      }
      if (data.session) {
        // Durable acceptance record (terms_acceptances) -- the checkbox alone
        // recorded nothing. Fire-and-forget: browser context, and a lost row
        // must not block a signup that already succeeded.
        fetch("/api/account/accept-terms", { method: "POST" }).catch(() => {});
        fetch("/api/auth/welcome", { method: "POST" }).catch(() => {});
        notify.success(t("auth.welcomeToast"));
        router.push(`/onboarding/${role}`);
      } else { router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`); }
    } catch (err: unknown) {
      // The mapper covers the unreachable-host case that used to be sniffed
      // for here by hand.
      setSignupError(authErrorMessage(err, t));
    }
    setLoading(false);
  }

  // F: resolve the invite once, and let it choose the role — the code is the
  // authority, not the ?role= in the same URL.
  useEffect(() => {
    if (!inviteParam) return;
    let live = true;
    fetch(`/api/invites/lookup?code=${encodeURIComponent(inviteParam)}`)
      .then(r => r.json())
      .then(j => {
        if (!live) return;
        setInvite(j);
        if (j?.valid && (j.role === "startup" || j.role === "investor")) setRole(j.role);
      })
      .catch(() => { if (live) setInvite({ valid: false }); });
    return () => { live = false; };
  }, [inviteParam]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function handleResend() {
    if (resendIn > 0 || resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResending(false);
    if (error) { notify.error(authErrorMessage(error, t)); return; }
    notify.success(t("auth.resendSent"));
    setResendIn(60);
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

          {/* Resend. Verification mail currently goes out through Supabase's
              built-in sender, which is capped at a few per hour and lands in
              spam often enough that "I never got the email" is the single most
              likely reason someone stalls here. Without this the only way
              forward was to start signup again. */}
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "12px" }}>
            {t("auth.didntReceive")}{" "}
            <button
              onClick={handleResend}
              disabled={resendIn > 0 || resending}
              style={{
                background: "none", border: "none",
                cursor: resendIn > 0 || resending ? "default" : "pointer",
                fontFamily: "'DM Sans', sans-serif", fontSize: "12px",
                color: resendIn > 0 || resending ? "var(--cr-ink-4)" : "var(--cr-copper)",
                textDecoration: resendIn > 0 || resending ? "none" : "underline",
              }}
            >
              {resending
                ? t("auth.resending")
                : resendIn > 0
                  ? t("auth.resendIn", { n: resendIn })
                  : t("auth.resendEmail")}
            </button>
            {" · "}
            <button onClick={() => { setStep("details"); setSignupError(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-copper)", textDecoration: "underline" }}>
              {t("auth.tryDifferentEmail")}
            </button>
          </p>
          <Link href="/auth/login" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "40px", borderRadius: "4px", border: "1px solid var(--cr-rule-dark)", background: "transparent", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)", cursor: "pointer", textDecoration: "none", boxSizing: "border-box" }}>
            {t("auth.goToSignIn")}
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

        {/* F: an invite is a person vouching for the platform. Saying who,
            by name, is the whole reason the link converts better than an ad. */}
        {inviteParam && invite && (
          invite.valid ? (
            <div style={{ background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", borderRadius: "4px", padding: "12px 14px", marginBottom: "16px" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)", fontWeight: 500 }}>
                {invite.inviterName
                  ? t("invite.bannerNamed", { name: invite.inviterName })
                  : t("invite.banner")}
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "3px" }}>
                {t(invite.role === "investor" ? "invite.asInvestor" : "invite.asFounder")}
              </p>
            </div>
          ) : (
            <div style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "12px 14px", marginBottom: "16px" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-3)" }}>{t("invite.expired")}</p>
            </div>
          )
        )}

        {/* Confirms the plan click actually registered. Without this the form
            is identical whether you picked a plan or not. */}
        {presetPlan && (
          <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "12px 14px", marginBottom: "16px" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)", fontWeight: 500 }}>
              {t("auth.selectedPlan", { plan: presetPlan.name })}
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "3px" }}>
              {t("auth.selectedPlanLaunch")}
            </p>
          </div>
        )}

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
                autoComplete={id === "password" ? "new-password" : id === "email" ? "email" : "name"}
                onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
              {id === "password" && password.length > 0 && (
                <div aria-live="polite" style={{ marginTop: "6px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} style={{ height: "3px", borderRadius: "2px", background: n <= strength ? strengthColor : "var(--cr-paper-4)", transition: "background 200ms" }} />
                    ))}
                  </div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: strengthColor, marginTop: "4px" }}>{strengthLabel}</p>
                </div>
              )}
            </div>
          ))}
          <div>
            <label htmlFor="confirm" style={labelSt}>{t("auth.confirmPassword")}</label>
            <input id="confirm" type="password" value={confirmPassword} required minLength={8} autoComplete="new-password"
              onChange={e => setConfirmPassword(e.target.value)}
              onFocus={onFocusCopper} onBlur={onBlurRule}
              style={{ ...iStyle, borderColor: passwordsMatch ? undefined : "var(--cr-down)" }} />
            {!passwordsMatch && (
              <p role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-down)", marginTop: "4px" }}>{t("auth.passwordsMismatch")}</p>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "9px", cursor: "pointer", marginTop: "2px" }}>
            <input type="checkbox" checked={ageConfirmed} required
              onChange={e => setAgeConfirmed(e.target.checked)}
              style={{ marginTop: "2px", accentColor: "var(--cr-copper)", cursor: "pointer", flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.55 }}>
              {t("auth.ageConfirm")}
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "9px", cursor: "pointer", marginTop: "2px" }}>
            <input type="checkbox" checked={termsAccepted} required
              onChange={e => setTermsAccepted(e.target.checked)}
              style={{ marginTop: "2px", accentColor: "var(--cr-copper)", cursor: "pointer", flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.55 }}>
              {t("auth.termsAgreement")}{" "}
              <Link href="/terms" style={{ color: "var(--cr-copper)", textDecoration: "none" }}>{t("auth.terms")}</Link>{" "}
              {t("auth.and")}{" "}
              <Link href="/privacy" style={{ color: "var(--cr-copper)", textDecoration: "none" }}>{t("auth.privacy")}</Link>.
            </span>
          </label>
          <button type="submit" disabled={loading || !isSupabaseConfigured || !canSubmit} className="btn-copper-shimmer"
            style={{ ...primaryBtn, opacity: loading || !isSupabaseConfigured || !canSubmit ? 0.5 : 1, cursor: loading || !isSupabaseConfigured || !canSubmit ? "not-allowed" : "pointer", marginTop: "4px" }}>
            {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
          </button>
        </form>

        <Divider />
        <GoogleButton onClick={handleGoogleSignup} disabled={!isSupabaseConfigured} />

        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)", textAlign: "center", marginTop: "16px", lineHeight: 1.6 }}>
          {t("auth.feeNote")}
        </p>
      </div>
    </div>
  );
}

/**
 * useSearchParams opts the subtree out of static rendering, so it has to sit
 * inside a Suspense boundary or the build fails on this route.
 */
export default function SignupPage() {
  return (
    <Suspense
      // Not `null`: this boundary covers the entire page, so an empty fallback
      // renders a blank screen on the server and holds it until hydration.
      // The shell keeps the background, top rule and logo in place so only the
      // form itself pops in.
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)", padding: "24px 16px", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "var(--cr-copper)" }} />
          <div style={{ width: "100%", maxWidth: "400px" }}>
            <Logo />
            <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", height: "420px" }} />
          </div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
