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
import { AlertTriangle, ExternalLink, Mail } from "lucide-react";
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
  letterSpacing: "0.08em", display: "block", marginBottom: "8px",
};
const primaryBtn: React.CSSProperties = {
  width: "100%", height: "44px", borderRadius: "999px",
  background: "var(--cr-copper)", color: "var(--cr-band-ink)",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
  fontSize: "13px", border: "none", cursor: "pointer",
  transition: "opacity 120ms",
};
// Banner tiles de-nested to ruled blocks: a 2px accent rail + hairline
// separation instead of a box inside the card.
const noticeBlock = (accent: string): React.CSSProperties => ({
  borderLeft: `2px solid ${accent}`,
  padding: "4px 0 4px 12px", marginBottom: "16px",
});

function onFocusCopper(e: React.FocusEvent<HTMLInputElement>) {
  (e.target as HTMLElement).style.borderColor = "var(--cr-copper)";
}
function onBlurRule(e: React.FocusEvent<HTMLInputElement>) {
  (e.target as HTMLElement).style.borderColor = "var(--cr-rule-dark)";
}

// House mark set as the ruled label -- the opener every step shares. Type
// carries the identity; the icon box is gone (matches update-password).
const Logo = () => (
  <Link href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40px", marginBottom: "32px", textDecoration: "none" }}>
    <span className="ruled-label">CapitalReach</span>
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
  // Weak reads as danger; fair and above is copper. Green means money
  // direction, never a success state -- the fill count carries the grade.
  const strengthColor = ["transparent", "var(--cr-down)", "var(--cr-copper)", "var(--cr-copper)", "var(--cr-copper)"][strength];
  const passwordsMatch = confirmPassword.length === 0 || confirmPassword === password;
  const canSubmit = termsAccepted && ageConfirmed && password.length >= 8 && confirmPassword === password;
  const router = useRouter();
  const supabase = createClient();

  // A signed-in visitor has no business on the signup form — every "List
  // your startup" CTA on the site points here for anonymous visitors, and a
  // logged-in founder clicking one should land in their dashboard, not in a
  // form that would try to create a second account.
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const r = profile?.role;
      router.replace(r === "startup" ? "/dashboard/startup" : r === "investor" ? "/dashboard/investor" : r === "admin" ? "/admin" : "/onboarding");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      } else {
        // Hand the address over via sessionStorage, not the query string: a URL
        // carries the email into browser history, Referer headers and logs.
        try { sessionStorage.setItem("cr_pending_email", email); } catch {}
        router.push("/auth/verify-email");
      }
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
    <div style={noticeBlock("var(--cr-copper)")}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <AlertTriangle style={{ width: 14, height: 14, color: "var(--cr-copper)", flexShrink: 0 }} />
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
    <div style={{ position: "relative", margin: "24px 0" }}>
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
      style={{ width: "100%", height: "44px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "border-color 120ms" }}
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
          <div style={{ width: 48, height: 48, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
            <Mail style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("auth.checkInbox")}</h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6, marginBottom: "24px" }}>
            {t("auth.verifyEmailSent")} <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink)" }}>{email}</strong>.
          </p>

          {/* De-nested: rule-separated rows with mono rails, not a box in a box. */}
          <div style={{ borderTop: "1px solid var(--cr-rule)", marginBottom: "24px", textAlign: "left" }}>
            {confirmSteps.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "12px", padding: "12px 0", borderBottom: "1px solid var(--cr-rule)" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>{item}</span>
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
          <div style={{ borderBottom: "3px solid var(--cr-copper)", marginBottom: "24px", paddingBottom: "16px" }}>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("auth.joinTitle")}</h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("auth.joiningAs")}</p>
          </div>

          {/* Rule-separated rows with mono rails -- the ledger, not icon cards.
              The diamond marks the chosen row. */}
          <div style={{ borderTop: "1px solid var(--cr-rule)", marginBottom: "24px" }}>
            {([
              { value: "startup",  label: t("auth.startupFounder"), desc: t("auth.startupDesc") },
              { value: "investor", label: t("auth.investor"),        desc: t("auth.investorDesc") },
            ] as { value: Role; label: string; desc: string }[]).map((opt, i) => {
              const active = role === opt.value;
              return (
                <button key={opt.value} onClick={() => setRole(opt.value)} aria-pressed={active}
                  style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%", minHeight: "56px", padding: "12px 8px", textAlign: "left", background: active ? "var(--cr-copper-bg)" : "transparent", border: "none", borderBottom: "1px solid var(--cr-rule)", cursor: "pointer", transition: "background 120ms" }}>
                  <span aria-hidden style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", flexShrink: 0 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", display: "block", marginBottom: "4px" }}>{opt.label}</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", display: "block" }}>{opt.desc}</span>
                  </span>
                  <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "12px", flexShrink: 0, opacity: active ? 1 : 0, transition: "opacity 120ms" }}>✦</span>
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

        {/* 40px hit area without moving the text off the left edge. */}
        <button onClick={() => { setStep("role"); setSignupError(""); }}
          style={{ display: "inline-flex", alignItems: "center", minHeight: "40px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-copper)", marginBottom: "8px", padding: 0 }}>
          ← {t("common.back")}
        </button>

        <div style={{ borderBottom: "3px solid var(--cr-copper)", marginBottom: "24px", paddingBottom: "16px" }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("auth.createAccount")}</h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>
            {t("auth.joiningAsRole")} <span style={{ color: "var(--cr-copper)", fontWeight: 500, textTransform: "capitalize" }}>{role}</span>
          </p>
        </div>

        {/* F: an invite is a person vouching for the platform. Saying who,
            by name, is the whole reason the link converts better than an ad. */}
        {/* Welcome, not profit: copper, never green -- green is money direction. */}
        {inviteParam && invite && (
          invite.valid ? (
            <div style={noticeBlock("var(--cr-copper)")}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)", fontWeight: 500 }}>
                {invite.inviterName
                  ? t("invite.bannerNamed", { name: invite.inviterName })
                  : t("invite.banner")}
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                {t(invite.role === "investor" ? "invite.asInvestor" : "invite.asFounder")}
              </p>
            </div>
          ) : (
            <div style={noticeBlock("var(--cr-rule-dark)")}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-3)" }}>{t("invite.expired")}</p>
            </div>
          )
        )}

        {/* Confirms the plan click actually registered. Without this the form
            is identical whether you picked a plan or not. */}
        {presetPlan && (
          <div style={noticeBlock("var(--cr-copper)")}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)", fontWeight: 500 }}>
              {t("auth.selectedPlan", { plan: presetPlan.name })}
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
              {t("auth.selectedPlanLaunch")}
            </p>
          </div>
        )}

        {signupError && (
          <div role="alert" style={{ ...noticeBlock("var(--cr-down)"), display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <AlertTriangle style={{ width: 14, height: 14, color: "var(--cr-down)", flexShrink: 0 }} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-down)" }}>{signupError}</p>
          </div>
        )}

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
                <div aria-live="polite" style={{ marginTop: "8px" }}>
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
          <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", minHeight: "40px" }}>
            <input type="checkbox" checked={ageConfirmed} required
              onChange={e => setAgeConfirmed(e.target.checked)}
              style={{ marginTop: "2px", accentColor: "var(--cr-copper)", cursor: "pointer", flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.55 }}>
              {t("auth.ageConfirm")}
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", minHeight: "40px" }}>
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
