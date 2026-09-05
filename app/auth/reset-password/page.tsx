"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { Mail } from "lucide-react";
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

export default function ResetPasswordPage() {
  const { t } = useTranslation();
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
    if (error) { notify.error(authErrorMessage(error, t)); }
    else { setSent(true); }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-paper)", padding: "24px 16px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "var(--cr-copper)" }} />

      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* House mark set as the ruled label -- matches signup/update-password. */}
        <Link href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "32px", minHeight: "40px", textDecoration: "none" }}>
          <span className="ruled-label">CapitalReach</span>
        </Link>

        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px" }}>
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 48, height: 48, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                <Mail style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("auth.checkInbox")}</h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6, marginBottom: "24px" }}>
                {t("auth.resetSentTo")} <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink)" }}>{email}</strong>. {t("auth.resetSentAction")}
              </p>
              <Link href="/auth/login" style={{ display: "inline-block", padding: "12px 8px", margin: "-12px -8px", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>
                {t("auth.backToSignIn")}
              </Link>
            </div>
          ) : (
            <>
              <div style={{ borderBottom: "1px solid var(--cr-rule)", marginBottom: "24px", paddingBottom: "16px" }}>
                <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("auth.resetPassword")}</div>
                <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("auth.resetTitle")}</h1>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("auth.resetSub")}</p>
              </div>

              <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label htmlFor="email" style={labelSt}>{t("auth.email")}</label>
                  <input id="email" type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    onFocus={e => (e.target.style.borderColor = "var(--cr-copper)")}
                    onBlur={e => (e.target.style.borderColor = "var(--cr-rule-dark)")}
                    style={iStyle} />
                </div>
                <button type="submit" disabled={loading} className="btn-copper-shimmer"
                  style={{ width: "100%", height: "44px", borderRadius: "999px", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "opacity 120ms" }}>
                  {loading ? t("auth.sending") : t("auth.sendReset")}
                </button>
              </form>

              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textAlign: "center", marginTop: "24px" }}>
                <Link href="/auth/login" style={{ color: "var(--cr-copper)", textDecoration: "none", display: "inline-block", padding: "12px 8px", margin: "-12px -8px" }}>{t("auth.backToSignIn")}</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
