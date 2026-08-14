"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { ShieldCheck, Loader2, Copy } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * TOTP two-factor authentication, via Supabase's own MFA.
 *
 * Expected by any investor before they upload financials, and the platform
 * had nothing. Flow: enroll returns a QR (an SVG data URI) and the raw
 * secret; the user scans it with any authenticator app and proves possession
 * with one code, which activates the factor. From then on
 * password-only sign-in stops at AAL1 and the login page demands a code
 * before any dashboard loads (the middleware sees only AAL1 cookies until
 * the challenge is verified, so there is nothing to "skip").
 *
 * Deliberate choices:
 * - The raw secret is shown next to the QR. Password managers and headless
 *   setups enter it by hand; QR-only enrolment locks those users out.
 * - Unenroll requires a current code. A stolen open laptop must not be
 *   enough to strip the account's second factor.
 * - Unverified factors left behind by an abandoned enrolment are cleaned up
 *   on mount rather than surfaced -- Supabase keeps them and they would
 *   otherwise appear as ghost "authenticators" the user never finished.
 */
type Factor = { id: string; status: "verified" | "unverified"; friendly_name?: string | null };

export function TwoFactorSection() {
  const { t } = useTranslation();
  const supabase = useRef(createClient()).current;

  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrolling, setEnrolling] = useState<null | { factorId: string; qr: string; secret: string }>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // Removing asks for a code too; separate state so the two inputs never share.
  const [removeCode, setRemoveCode] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  async function refresh() {
    const { data } = await supabase.auth.mfa.listFactors();
    const all = (data?.totp ?? []) as Factor[];
    // Abandoned enrolments: unverified factors are ghosts; drop them quietly.
    for (const f of all.filter((f) => f.status === "unverified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    }
    setFactors(all.filter((f) => f.status === "verified"));
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function startEnroll() {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator" });
    setBusy(false);
    if (error || !data) { notify.error(t("twofa.enrollFailed")); return; }
    setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmEnroll() {
    if (!enrolling || code.trim().length < 6) return;
    setBusy(true);
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
    if (chErr || !challenge) { setBusy(false); notify.error(t("twofa.enrollFailed")); return; }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) { notify.error(t("twofa.wrongCode")); return; }
    notify.success(t("twofa.enabled"));
    setEnrolling(null);
    setCode("");
    refresh();
  }

  async function cancelEnroll() {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId }).catch(() => {});
    setEnrolling(null);
    setCode("");
  }

  async function removeFactor(factorId: string) {
    if (removeCode.trim().length < 6) return;
    setBusy(true);
    // Proof of possession before removal: challenge+verify with the current
    // code, then unenroll. Without this, any open session could strip 2FA.
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (!chErr && challenge) {
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: removeCode.trim() });
      if (vErr) { setBusy(false); notify.error(t("twofa.wrongCode")); return; }
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) { notify.error(t("twofa.removeFailed")); return; }
    notify.success(t("twofa.removed"));
    setRemoving(null);
    setRemoveCode("");
    refresh();
  }

  const label: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" };
  const sub: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", lineHeight: 1.6 };
  const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "9px 16px", cursor: "pointer" };
  const outline: React.CSSProperties = { ...btn, background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontWeight: 400 };
  const codeInput: React.CSSProperties = { width: "120px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'JetBrains Mono', monospace", fontSize: "14px", letterSpacing: "0.2em", color: "var(--cr-ink)", padding: "8px 10px", outline: "none", textAlign: "center" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <ShieldCheck style={{ width: 14, height: 14, color: "var(--cr-copper)" }} />
        <p style={label}>{t("twofa.title")}</p>
        {factors && factors.length > 0 && (
          <span style={{ background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", color: "var(--cr-up)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", borderRadius: "3px", padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("twofa.on")}
          </span>
        )}
      </div>
      <p style={{ ...sub, marginBottom: "12px" }}>{t("twofa.sub")}</p>

      {factors === null ? (
        <Loader2 style={{ width: 14, height: 14, color: "var(--cr-ink-4)" }} className="animate-spin" />
      ) : enrolling ? (
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px", display: "flex", flexWrap: "wrap", gap: "16px" }}>
          {/* The QR from Supabase is a self-contained SVG data URI. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolling.qr} alt={t("twofa.qrAlt")} width={132} height={132}
            style={{ background: "#fff", borderRadius: "4px", padding: "6px", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: "220px" }}>
            <p style={{ ...sub, marginBottom: "8px" }}>{t("twofa.scanHint")}</p>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(enrolling.secret); notify.success(t("twofa.secretCopied")); }}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-3)", padding: "6px 10px", cursor: "pointer", marginBottom: "12px", maxWidth: "100%" }}>
              <Copy style={{ width: 11, height: 11, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{enrolling.secret}</span>
            </button>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" placeholder="000000" aria-label={t("twofa.codeLabel")} style={codeInput} />
              <button onClick={confirmEnroll} disabled={busy || code.length < 6} style={{ ...btn, opacity: busy || code.length < 6 ? 0.5 : 1 }}>
                {busy ? t("twofa.checking") : t("twofa.activate")}
              </button>
              <button onClick={cancelEnroll} disabled={busy} style={outline}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      ) : factors.length === 0 ? (
        <button onClick={startEnroll} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
          {busy ? t("twofa.working") : t("twofa.enable")}
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {factors.map((f) => (
            <div key={f.id} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>
                  {f.friendly_name || t("twofa.authApp")}
                </span>
                {removing === f.id ? (
                  <span style={{ display: "inline-flex", gap: "8px", alignItems: "center", marginInlineStart: "auto" }}>
                    <input value={removeCode} onChange={(e) => setRemoveCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric" placeholder="000000" aria-label={t("twofa.codeLabel")} style={codeInput} />
                    <button onClick={() => removeFactor(f.id)} disabled={busy || removeCode.length < 6}
                      style={{ ...outline, color: "var(--cr-down)", borderColor: "rgba(155,35,53,0.3)", opacity: busy || removeCode.length < 6 ? 0.5 : 1 }}>
                      {t("twofa.confirmRemove")}
                    </button>
                    <button onClick={() => { setRemoving(null); setRemoveCode(""); }} style={outline}>{t("common.cancel")}</button>
                  </span>
                ) : (
                  <button onClick={() => setRemoving(f.id)}
                    style={{ marginInlineStart: "auto", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-down)", textDecoration: "underline", textUnderlineOffset: "2px" }}>
                    {t("twofa.remove")}
                  </button>
                )}
              </div>
              {removing === f.id && <p style={{ ...sub, marginTop: "6px" }}>{t("twofa.removeHint")}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
