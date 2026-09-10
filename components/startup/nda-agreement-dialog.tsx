"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * The clickwrap dialog.
 *
 * The text is fetched from /api/nda/agreement rather than rendered locally,
 * because the acceptance stores a SHA-256 of the server's rendering with the
 * recipient's own name in it. A locally rendered copy names nobody, so its
 * bytes differ from the bytes that get hashed, and the stored hash would then
 * prove a document the signer was never shown. The fingerprint on screen is
 * the one that lands in the row, and it is sent back with the acceptance so
 * the server can refuse a stale render outright.
 *
 * Every refusal carries somewhere to go. The three that can reach this dialog
 * are a plan gate, a verification gate and a missing accreditation
 * attestation, and all three are things the investor can act on; a 403 with
 * only a sentence would leave them looking at a locked room with no next step.
 */

interface Agreement {
  startupId: string;
  company: string;
  requiresNda: boolean;
  version: string;
  sha256: string;
  text: string;
  recipient: { name: string | null; entity: string | null; trustLevel: number };
  confidentialityMonths: number;
  nonCircumventionMonths: number;
  obligationsEndAt: string;
  signed: {
    at: string;
    version: string | null;
    sha256: string | null;
    obligationsEndAt: string | null;
    matchesCurrent: boolean;
  } | null;
}

interface Refusal {
  message: string;
  href: string;
  cta: string;
}

interface Props {
  open: boolean;
  startupId: string;
  startupName: string;
  onCancel: () => void;
  /** Fired once the acceptance is recorded, so the page can refetch. */
  onAccepted: () => void;
}

export function NdaAgreementDialog({ open, startupId, startupName, onCancel, onAccepted }: Props) {
  const { t, locale } = useTranslation();
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    setAgreement(null);
    try {
      const res = await fetch(`/api/nda/agreement?startupId=${encodeURIComponent(startupId)}`);
      if (!res.ok) { setLoadFailed(true); return; }
      setAgreement(await res.json());
    } catch {
      setLoadFailed(true);
    }
  }, [startupId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRefusal(null);
    setBusy(false);
    load();
  }, [open, load]);

  useEscapeKey(open && !busy, onCancel);

  if (!open) return null;

  const day = (iso: string | null | undefined): string => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  };

  async function accept() {
    if (!agreement || busy) return;
    setBusy(true);
    setError(null);
    setRefusal(null);
    try {
      const res = await fetch("/api/nda/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The hash of what was on screen. The server re-renders the text and
        // refuses if the two disagree, which is what stops a page left open
        // across a wording change from signing the new one unseen.
        body: JSON.stringify({ startupId, agreedSha256: agreement.sha256 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.upgrade) {
          setRefusal({ message: data.error, href: "/pricing", cta: t("common.viewPlans") });
        } else if (data?.error === "verification_required") {
          setRefusal({
            message: t(data.messageKey ?? "gate.dataroomBlocked"),
            href: data.verifyUrl ?? "/verify",
            cta: t("verify.start"),
          });
        } else if (data?.code === "ACCREDITATION_REQUIRED") {
          // The attestation lives on the INVESTOR settings page, not the
          // generic one, and the anchor scrolls straight to it. A refusal
          // whose link lands on a page without the control is the same dead
          // end as no link at all.
          setRefusal({
            message: t("offerComposer.notAccredited"),
            href: "/dashboard/investor/settings#accreditation",
            cta: t("offerComposer.notAccreditedCta"),
          });
        } else {
          setError(data?.error || t("errors.generic"));
        }
        return;
      }
      onAccepted();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const alreadySigned = !!agreement?.signed;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nda-dialog-title"
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cr-scrim)", padding: "16px" }}
    >
      <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", width: "100%", maxWidth: "560px", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "24px 24px 16px", borderBottom: "1px solid var(--cr-rule)" }}>
          <h3 id="nda-dialog-title" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)" }}>
            {t("startupDetail.ndaTitle")}
          </h3>
          <button onClick={onCancel} disabled={busy} aria-label={t("common.close")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", padding: 4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: "16px 24px", overflowY: "auto" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", marginBottom: "14px", lineHeight: 1.55 }}>
            {t("startupDetail.ndaIntro", { name: startupName })}
          </p>

          {!agreement && !loadFailed && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", padding: "24px 0" }}>
              {t("common.loading")}
            </p>
          )}

          {loadFailed && (
            <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "10px" }}>
              <p role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", lineHeight: 1.55 }}>
                {t("nda.loadFailed")}
              </p>
              <button onClick={load}
                style={{ height: "36px", padding: "0 16px", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-2)", cursor: "pointer" }}>
                {t("nda.retry")}
              </button>
            </div>
          )}

          {agreement && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "baseline", marginBottom: "12px" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)" }}>
                  {t("nda.parties")}
                </span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)" }}>
                  {/* Name only. The entity is spelled out in the document
                      itself, two lines down, in the wording that binds. */}
                  {agreement.recipient.name
                    ? t("nda.recipientYou", { name: agreement.recipient.name })
                    : t("nda.recipientUnnamed")}
                </span>
              </div>

              <pre style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "16px 18px", margin: 0 }}>
                {agreement.text}
              </pre>

              <div style={{ marginTop: "16px", display: "grid", gap: "8px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)" }}>
                    {t("nda.fingerprint")}
                  </span>
                  <code style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 500, fontSize: "11px", letterSpacing: "0.02em", color: "var(--cr-ink-2)", wordBreak: "break-all" }}>
                    {agreement.sha256}
                  </code>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 500, fontSize: "11px", letterSpacing: "0.02em", color: "var(--cr-ink-4)" }}>
                    {t("nda.version", { version: agreement.version })}
                  </span>
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", lineHeight: 1.55, margin: 0 }}>
                  {t("nda.fingerprintHint")}
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.55, margin: 0 }}>
                  {t("nda.obligationsUntil", { date: day(agreement.obligationsEndAt) })}{" "}
                  {t("nda.tailMonths", { months: agreement.nonCircumventionMonths })}
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.55, margin: 0 }}>
                  {t("nda.accessLogged")}
                </p>

                {agreement.signed && (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-2)", lineHeight: 1.55, margin: 0, paddingTop: "8px", borderTop: "1px solid var(--cr-rule)" }}>
                    {t("nda.signedOnVersion", { version: agreement.signed.version ?? agreement.version, date: day(agreement.signed.at) })}
                    {!agreement.signed.matchesCurrent && ` ${t("nda.wordingChanged")}`}
                  </p>
                )}
              </div>
            </>
          )}

          {refusal && (
            <div role="alert" style={{ marginTop: "14px", padding: "12px 14px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", lineHeight: 1.55, marginBottom: "8px" }}>
                {refusal.message}
              </p>
              <Link href={refusal.href}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>
                {refusal.cta} →
              </Link>
            </div>
          )}

          {error && (
            <p role="alert" style={{ marginTop: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12.5px", color: "var(--cr-down)" }}>
              {error}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", padding: "16px 24px 24px", borderTop: "1px solid var(--cr-rule)" }}>
          <button onClick={onCancel} disabled={busy}
            style={{ height: "40px", padding: "0 18px", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
            {alreadySigned ? t("common.close") : t("common.cancel")}
          </button>
          {!alreadySigned && (
            <button onClick={accept} disabled={!agreement || busy}
              style={{ height: "40px", padding: "0 22px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-band-ink)", cursor: !agreement || busy ? "default" : "pointer", opacity: !agreement || busy ? 0.5 : 1 }}>
              {busy ? t("common.saving") : t("startupDetail.ndaAcceptBtn")}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
