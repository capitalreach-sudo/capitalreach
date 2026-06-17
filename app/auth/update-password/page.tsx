"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import Link from "next/link";
import { Lock, Eye, EyeOff, TrendingUp, CheckCircle2 } from "lucide-react";

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

export default function UpdatePasswordPage() {
  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [done, setDone]                 = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event) => {
      if (event === "PASSWORD_RECOVERY") {
        // session active — form is ready
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { notify.error("Passwords don't match"); return; }
    if (password.length < 8) { notify.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { notify.error(error.message); }
    else {
      setDone(true);
      notify.success("Password updated!");
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

  const strengthLabels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  const strengthBarColors = [
    "var(--cr-down)",
    "var(--cr-down)",
    "#D97706",
    "var(--cr-copper)",
    "var(--cr-up)",
  ];

  const score = strengthScore(password);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)", padding: "24px 16px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "var(--cr-copper)" }} />

      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "36px", textDecoration: "none" }}>
          <div style={{ width: 28, height: 28, background: "var(--cr-copper)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <TrendingUp style={{ width: 14, height: 14, color: "#fff" }} />
          </div>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "15px", color: "var(--cr-copper)", letterSpacing: "-0.02em" }}>CapitalReach</span>
        </Link>

        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px" }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ width: 48, height: 48, background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.2)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <CheckCircle2 style={{ width: 22, height: 22, color: "var(--cr-up)" }} />
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)", marginBottom: "6px" }}>Password updated!</h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              <div style={{ borderBottom: "3px solid var(--cr-copper)", marginBottom: "24px", paddingBottom: "20px" }}>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "4px" }}>Set a new password</h1>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>Choose a strong password for your account</p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label htmlFor="password" style={labelSt}>New Password</label>
                  <div style={{ position: "relative" }}>
                    <input id="password" type={showPassword ? "text" : "password"} value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters"
                      required minLength={8}
                      onFocus={e => (e.target.style.borderColor = "var(--cr-copper)")}
                      onBlur={e => (e.target.style.borderColor = "var(--cr-rule-dark)")}
                      style={{ ...iStyle, paddingRight: "40px" }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", padding: 0 }}>
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
                  <label htmlFor="confirm" style={labelSt}>Confirm Password</label>
                  <input id="confirm" type={showPassword ? "text" : "password"} value={confirm}
                    onChange={e => setConfirm(e.target.value)} placeholder="Re-enter new password"
                    required
                    onFocus={e => (e.target.style.borderColor = "var(--cr-copper)")}
                    onBlur={e => (e.target.style.borderColor = "var(--cr-rule-dark)")}
                    style={{ ...iStyle, borderColor: confirm && password !== confirm ? "var(--cr-down)" : "var(--cr-rule-dark)" }} />
                  {confirm && password !== confirm && (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-down)", marginTop: "4px" }}>Passwords don&apos;t match</p>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "10px 12px" }}>
                  <Lock style={{ width: 12, height: 12, color: "var(--cr-ink-4)", flexShrink: 0 }} />
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>256-bit SSL encryption. Your password is never stored in plain text.</p>
                </div>

                <button type="submit" disabled={loading || password !== confirm || password.length < 8}
                  style={{ width: "100%", height: "44px", borderRadius: "4px", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "14px", border: "none", cursor: loading || password !== confirm || password.length < 8 ? "not-allowed" : "pointer", opacity: loading || password !== confirm || password.length < 8 ? 0.5 : 1, transition: "opacity 120ms", marginTop: "4px" }}>
                  {loading ? "Updating…" : "Update Password"}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textAlign: "center", marginTop: "16px" }}>
          Remember it now?{" "}
          <Link href="/auth/login" style={{ color: "var(--cr-copper)", textDecoration: "none" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
