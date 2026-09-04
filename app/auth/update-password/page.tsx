"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import Link from "next/link";
import { Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";
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
  letterSpacing: "0.08em", display: "block", marginBottom: "8px",
};

export default function UpdatePasswordPage() {
  const { t } = useTranslation();
  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [done, setDone]                 = useState(false);
  // null = still resolving, false = no recovery session (bad/expired link),
  // true = ready. Without this, a dead link showed a working-looking form
  // whose submit failed with a cryptic "Auth session missing".
  const [ready, setReady]               = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // The recovery code in the URL is exchanged automatically by the client;
    // give it a moment, then check whether a session actually materialised.
    const timer = window.setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setReady(prev => prev ?? !!session);
    }, 1500);
    return () => { sub.subscription.unsubscribe(); window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { notify.error(t("auth.passwordsNoMatch")); return; }
    if (password.length < 8) { notify.error(t("auth.passwordMin")); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { notify.error(authErrorMessage(error, t)); }
    else {
      setDone(true);
      notify.success(t("auth.passwordUpdated"));
      setTimeout(() => router.push("/auth/login"), 2500);
    }
    setLoading(false);
  }

  function strengthScore(pw: string) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(Math.floor(score / 1.25), 4);
  }

  const strengthLabels = [
    t("auth.strength0"), t("auth.strength1"), t("auth.strength2"),
    t("auth.strength3"), t("auth.strength4"),
  ];
  // Weak reads as danger; everything at "fair" and above is copper.
  // Green is money direction, not a success state.
  const strengthBarColors = [
    "var(--cr-down)",
    "var(--cr-down)",
    "var(--cr-copper)",
    "var(--cr-copper)",
    "var(--cr-copper)",
  ];

  const score = strengthScore(password);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)", padding: "24px 16px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "var(--cr-copper)" }} />

      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* House mark, set as the ruled label */}
        <Link href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40px", marginBottom: "32px", textDecoration: "none" }}>
          <span className="ruled-label">CapitalReach</span>
        </Link>

        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px" }}>
          {ready === false && !done ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 15, color: "var(--cr-ink)", marginBottom: 8 }}>{t("auth.resetLinkDeadTitle")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 13, color: "var(--cr-ink-3)", lineHeight: 1.6, marginBottom: 16 }}>{t("auth.resetLinkDeadBody")}</p>
              <Link href="/auth/reset-password" style={{ display: "inline-flex", background: "var(--cr-copper)", color: "var(--cr-band-ink)", borderRadius: 4, padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                {t("auth.requestNewLink")}
              </Link>
            </div>
          ) : done ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              {/* Success is copper, not green -- green means money direction only. */}
              <div style={{ width: 48, height: 48, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                <CheckCircle2 style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("auth.passwordUpdated")}</h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("auth.redirectingSignIn")}</p>
            </div>
          ) : (
            <>
              <div style={{ borderBottom: "3px solid var(--cr-copper)", marginBottom: "24px", paddingBottom: "16px" }}>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("auth.updateTitle")}</h1>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("auth.updateSub")}</p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label htmlFor="password" style={labelSt}>{t("auth.newPassword")}</label>
                  <div style={{ position: "relative" }}>
                    <input id="password" type={showPassword ? "text" : "password"} value={password}
                      onChange={e => setPassword(e.target.value)} placeholder={t("auth.minChars")}
                      required minLength={8}
                      onFocus={e => (e.target.style.borderColor = "var(--cr-copper)")}
                      onBlur={e => (e.target.style.borderColor = "var(--cr-rule-dark)")}
                      style={{ ...iStyle, paddingRight: "48px" }} />
                    {/* 40x40 hit area; the icon still reads at 12px from the edge. */}
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                      style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", padding: 0 }}>
                      {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                  {password.length > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                        {[1, 2, 3, 4].map(level => (
                          <div key={level} style={{ height: "3px", flex: 1, borderRadius: "2px", background: score >= level ? strengthBarColors[score] : "var(--cr-rule-dark)", transition: "background 200ms" }} />
                        ))}
                      </div>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>{strengthLabels[score]}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="confirm" style={labelSt}>{t("auth.confirmPassword")}</label>
                  <input id="confirm" type={showPassword ? "text" : "password"} value={confirm}
                    onChange={e => setConfirm(e.target.value)} placeholder={t("auth.reenterPassword")}
                    required
                    onFocus={e => (e.target.style.borderColor = "var(--cr-copper)")}
                    onBlur={e => (e.target.style.borderColor = "var(--cr-rule-dark)")}
                    style={{ ...iStyle, borderColor: confirm && password !== confirm ? "var(--cr-down)" : "var(--cr-rule-dark)" }} />
                  {confirm && password !== confirm && (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-down)", marginTop: "4px" }}>{t("auth.passwordsNoMatch")}</p>
                  )}
                </div>

                {/* Rule-topped label line, not a box-in-a-box. */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", borderTop: "1px solid var(--cr-rule)", paddingTop: "12px" }}>
                  <Lock style={{ width: 12, height: 12, color: "var(--cr-ink-4)", flexShrink: 0 }} />
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("auth.sslNote")}</p>
                </div>

                <button type="submit" disabled={loading || password !== confirm || password.length < 8}
                  style={{ width: "100%", height: "44px", borderRadius: "4px", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "14px", border: "none", cursor: loading || password !== confirm || password.length < 8 ? "not-allowed" : "pointer", opacity: loading || password !== confirm || password.length < 8 ? 0.5 : 1, transition: "opacity 120ms", marginTop: "4px" }}>
                  {loading ? t("auth.updating") : t("auth.updatePassword")}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textAlign: "center", marginTop: "16px" }}>
          {t("auth.rememberNow")}{" "}
          <Link href="/auth/login" style={{ color: "var(--cr-copper)", textDecoration: "none" }}>{t("auth.signIn")}</Link>
        </p>
      </div>
    </div>
  );
}
