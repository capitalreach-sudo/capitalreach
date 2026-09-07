"use client";

import { useRef, useState, type CSSProperties } from "react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import type { EvidenceKind } from "@/lib/trust";

/**
 * One line of the application, and the only place a document leaves the
 * browser.
 *
 * Three shapes of work, because three shapes exist:
 *   self-serve  -- the applicant proves it themselves (a TXT record in DNS)
 *   upload      -- a human reads a document
 *   vendor      -- an identity check nobody has wired up yet
 *
 * The vendor case is written out rather than hidden. A greyed-out row with no
 * explanation reads as a broken page; a row that says "this is not open yet,
 * here is what happens when it is" reads as a company that knows what it has
 * built. Nothing here pretends to check a passport.
 */

export interface EvidenceView {
  id: string;
  kind: string;
  method: string;
  status: string;
  checkedAt: string | null;
  /** From detail.filename. The path itself never reaches a browser. */
  filename?: string | null;
  /** From detail.domain, for the domain proof. */
  domain?: string | null;
}

export type ItemMode = "self_serve" | "upload" | "vendor";

/** How each kind is satisfied. Every kind is listed so a ladder change cannot
 *  silently produce a row with no way to act on it. */
export const KIND_MODE: Record<EvidenceKind, ItemMode> = {
  email_domain:       "self_serve",
  domain_control:     "self_serve",
  identity_document:  "vendor",
  liveness:           "vendor",
  company_registry:   "upload",
  director_authority: "upload",
  bank_account:       "upload",
  accreditation:      "upload",
  revenue_proof:      "upload",
  fund_proof:         "upload",
  reference:          "upload",
  other:              "upload",
};

/** Received or confirmed. Anything else still needs the applicant. */
export function isSatisfied(row: EvidenceView | null | undefined): boolean {
  return !!row && (row.status === "passed" || row.status === "pending");
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "application/pdf,image/jpeg,image/png";

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const DATA: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
  fontWeight: 500, fontSize: "11px", letterSpacing: "0.02em",
};

const BODY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  lineHeight: 1.65, color: "var(--cr-ink-3)",
};

/** Every action on this page is reachable on a phone, so nothing here drops
 *  under the 40px touch target the spec sets. */
const ACTION: CSSProperties = { fontSize: "13px", padding: "9px 18px", minHeight: "40px" };

const FIELD: CSSProperties = {
  width: "100%", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px", padding: "9px 12px", color: "var(--cr-ink)",
  fontFamily: "'DM Sans', sans-serif", fontSize: "13px", minHeight: "40px",
};

/** Verdigris is the matured state; copper asks for attention. Green and red
 *  are reserved for money direction and say nothing here. */
function statusColor(status: string): string {
  if (status === "passed") return "var(--verdigris)";
  if (status === "failed") return "var(--cr-copper)";
  return "var(--cr-ink-4)";
}

export function EvidenceItem({
  index, kind, evidence, caseId, editable, domainRecord, suggestedDomain, onChanged,
}: {
  index: number;
  kind: EvidenceKind;
  evidence: EvidenceView | null;
  /** Null until the applicant has opened a case. */
  caseId: string | null;
  editable: boolean;
  domainRecord: { host: string; value: string } | null;
  suggestedDomain: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const mode = KIND_MODE[kind];
  const fileRef = useRef<HTMLInputElement>(null);

  const [domain, setDomain] = useState(evidence?.domain ?? suggestedDomain ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const done = isSatisfied(evidence);
  const canAct = editable && !!caseId && !busy;

  async function post(path: string, body: BodyInit, headers?: HeadersInit) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST", body, headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(json.messageKey ? t(json.messageKey) : json.error || t("errors.generic"));
        return null;
      }
      return json;
    } catch {
      notify.error(t("errors.generic"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function runDomainCheck() {
    if (!caseId) return;
    const json = await post(
      "/api/verification/domain-check",
      JSON.stringify({ caseId, domain }),
      { "Content-Type": "application/json" },
    );
    if (!json) return;
    // The checker owns the wording of its own outcomes; the row's new status
    // says the same thing on the page, so a missing key is not worth a toast.
    if (typeof json.messageKey === "string") {
      if (json.passed) notify.success(t(json.messageKey));
      else notify.info(t(json.messageKey));
    }
    onChanged();
  }

  async function upload(file: File) {
    if (!caseId) return;
    // Checked here for a fast, specific answer; the route enforces both again.
    if (!ACCEPT.split(",").includes(file.type)) { notify.error(t("verify.fileType")); return; }
    if (file.size > MAX_BYTES) { notify.error(t("verify.fileTooLarge")); return; }
    const form = new FormData();
    form.set("caseId", caseId);
    form.set("kind", kind);
    form.set("file", file);
    if (note.trim()) form.set("note", note.trim());
    const json = await post("/api/verification/evidence", form);
    if (!json) return;
    notify.success(t("verify.uploaded"));
    onChanged();
  }

  async function reserveVendor() {
    if (!caseId) return;
    const json = await post(
      "/api/verification/evidence",
      JSON.stringify({ caseId, kind }),
      { "Content-Type": "application/json" },
    );
    if (!json) return;
    notify.success(t("verify.vendorReserved"));
    onChanged();
  }

  function copyRecord() {
    if (!domainRecord) return;
    navigator.clipboard?.writeText(domainRecord.value)
      .then(() => notify.success(t("common.copied")))
      .catch(() => notify.error(t("errors.generic")));
  }

  return (
    <div style={{ borderTop: "1px solid var(--cr-rule)", padding: "20px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        <span aria-hidden style={{ ...DATA, color: "var(--cr-copper)", flexShrink: 0, width: "22px" }}>
          {String(index).padStart(2, "0")}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            gap: "12px", flexWrap: "wrap",
          }}>
            <h3 style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px",
              color: "var(--cr-ink)", margin: 0,
            }}>
              {t(`trust.ev.${kind}`)}
            </h3>
            <span style={{ ...LABEL, color: statusColor(evidence?.status ?? "") }}>
              {evidence ? t(`verify.ev.${evidence.status}`) : t("verify.ev.outstanding")}
            </span>
          </div>

          <p style={{ ...BODY, marginTop: "6px" }}>{t(`verify.need.${kind}`)}</p>
          <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>
            {t(`verify.why.${kind}`)}
          </p>

          {/* ── Self-serve: the applicant proves it, nobody reads anything ── */}
          {mode === "self_serve" && kind === "domain_control" && (
            <div style={{ marginTop: "12px" }}>
              <label style={{ ...LABEL, display: "block", marginBottom: "4px" }} htmlFor={`domain-${kind}`}>
                {t("verify.domainLabel")}
              </label>
              <input
                id={`domain-${kind}`}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                disabled={!canAct}
                style={{ ...FIELD, maxWidth: "320px" }}
              />

              {domainRecord && (
                <div style={{
                  marginTop: "12px", background: "var(--cr-paper-3)",
                  border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "12px 16px",
                }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                    <span style={{ ...LABEL, width: "56px", flexShrink: 0 }}>{t("verify.recordType")}</span>
                    <span style={{ ...DATA, color: "var(--cr-ink-2)" }}>TXT</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "baseline", marginTop: "4px" }}>
                    <span style={{ ...LABEL, width: "56px", flexShrink: 0 }}>{t("verify.recordHost")}</span>
                    <span style={{ ...DATA, color: "var(--cr-ink-2)" }}>@</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "baseline", marginTop: "4px" }}>
                    <span style={{ ...LABEL, width: "56px", flexShrink: 0 }}>{t("verify.recordValue")}</span>
                    <span style={{
                      ...DATA, color: "var(--cr-ink)", wordBreak: "break-all", minWidth: 0,
                    }}>
                      {domainRecord.value}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "10px", flexWrap: "wrap" }}>
                    <button type="button" onClick={copyRecord} className="btn-ghost" style={{ ...ACTION, fontSize: "12px", padding: "8px 14px" }}>
                      {t("verify.copyRecord")}
                    </button>
                    <span style={{ ...BODY, fontSize: "11px", color: "var(--cr-ink-4)", flex: 1, minWidth: "200px" }}>
                      {t("verify.recordHostHint", { host: domainRecord.host })}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "12px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={runDomainCheck}
                  disabled={!canAct || !domain.trim()}
                  className="btn-ghost"
                  style={{ ...ACTION, opacity: canAct && domain.trim() ? 1 : 0.5 }}
                >
                  {busy ? t("verify.checking") : t("verify.checkNow")}
                </button>
                <span style={{ ...BODY, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                  {t("verify.domainHelp")}
                </span>
              </div>
            </div>
          )}

          {/* The account email already sits at the domain. Nothing to do. */}
          {mode === "self_serve" && kind === "email_domain" && (
            <p style={{ ...BODY, fontSize: "12px", marginTop: "10px", color: "var(--cr-ink-4)" }}>
              {done ? t("verify.emailDomainDone") : t("verify.emailDomainPending")}
            </p>
          )}

          {/* ── Vendor: honest about what is not built ────────────────────── */}
          {mode === "vendor" && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ ...LABEL, color: "var(--cr-copper)" }}>{t("verify.vendorTitle")}</div>
              <p style={{ ...BODY, fontSize: "12px", marginTop: "4px" }}>{t("verify.vendorBody")}</p>
              {done ? (
                <p style={{ ...DATA, color: "var(--verdigris)", marginTop: "8px" }}>
                  {t("verify.vendorReserved")}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={reserveVendor}
                  disabled={!canAct}
                  className="btn-ghost"
                  style={{ ...ACTION, marginTop: "10px", opacity: canAct ? 1 : 0.5 }}
                >
                  {busy ? t("verify.saving") : t("verify.vendorReserve")}
                </button>
              )}
            </div>
          )}

          {/* ── Upload: a human will read this ────────────────────────────── */}
          {mode === "upload" && (
            <div style={{ marginTop: "12px" }}>
              {evidence?.filename && (
                <p style={{ ...DATA, color: "var(--cr-ink-2)", marginBottom: "8px", wordBreak: "break-all" }}>
                  {evidence.filename}
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Reset first: choosing the same file twice must still fire.
                  e.target.value = "";
                  if (f) void upload(f);
                }}
              />
              {editable && (
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("verify.notePlaceholder")}
                  maxLength={300}
                  disabled={!canAct}
                  style={{ ...FIELD, maxWidth: "420px", marginBottom: "10px" }}
                />
              )}
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!canAct}
                  className="btn-ghost"
                  style={{ ...ACTION, opacity: canAct ? 1 : 0.5 }}
                >
                  {busy ? t("verify.uploading") : done ? t("verify.replaceFile") : t("verify.chooseFile")}
                </button>
                <span style={{ ...BODY, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                  {t("verify.fileRules")}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
