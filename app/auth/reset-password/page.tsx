"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { Mail, TrendingUp } from "lucide-react";

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

export default function ResetPasswordPage() {
  const [email, setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const supabase = createClient();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    if (error) { notify.error(error.message); }
    else { setSent(true); }
    setLoading(false);
  }

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
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 48, height: 48, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <Mail style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "8px" }}>Check your inbox</h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6, marginBottom: "24px" }}>
                We sent a reset link to <strong style={{ fontWeight: 500, color: "var(--cr-ink)" }}>{email}</strong>. Click it to set a new password.
              </p>
              <Link href="/auth/login" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div style={{ borderBottom: "3px solid var(--cr-copper)", marginBottom: "24px", paddingBottom: "20px" }}>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "4px" }}>Reset your password</h1>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>Enter your email and we&apos;ll send a reset link</p>
              </div>

              <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label htmlFor="email" style={labelSt}>Email address</label>
                  <input id="email" type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    onFocus={e => (e.target.style.borderColor = "var(--cr-copper)")}
                    onBlur={e => (e.target.style.borderColor = "var(--cr-rule-dark)")}
                    style={iStyle} />
                </div>
                <button type="submit" disabled={loading}
                  style={{ width: "100%", height: "44px", borderRadius: "4px", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "14px", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "opacity 120ms" }}>
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>

              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textAlign: "center", marginTop: "20px" }}>
                <Link href="/auth/login" style={{ color: "var(--cr-copper)", textDecoration: "none" }}>Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
