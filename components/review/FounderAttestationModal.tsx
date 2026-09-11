"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * The founder putting their name to their own listing.
 *
 * The document, its version and its hash all come from the server, and the
 * only thing this component sends back is a tick and a typed name. That split
 * is the point: a hash computed in the browser is a hash computed by the party
 * the attestation would be produced against, and it proves nothing. The route
 * renders the same bytes it served, hashes those, and writes the timestamp,
 * the version, the hash and the network address together, which is what
 * startups_attestation_server_only (126) exists to force.
 *
 * ON THE NAME. It is compared to the name on the profile and a mismatch WARNS.
 * It never refuses. People type "Jack B." for "Jack Boritzki", they type the
 * name they go by, they type their name the way their passport has it and
 * their profile the way their colleagues do. A real founder locked out of
 * listing their own company by a string comparison is a worse outcome by a
 * wide margin than a signature that reads a little differently from the
 * account it was made on, and the account, the time and the address are all
 * recorded beside it regardless.
 */

/** Server-owned. GET returns the exact bytes to sign, POST records the
 *  signature against the bytes it renders again. */
const ATTEST_ENDPOINT = "/api/startups/attest";

interface AttestationDocument {
  text: string;
  version: string;
  sha256: string;
  /** The name on the profile, for the loose comparison below. */
  profileName: string | null;
  /** Set where this founder has already attested to this wording. */
  attestedAt: string | null;
}

export interface AttestationResult {
  attestedAt: string;
  version: string;
  sha256: string;
}

function normalise(value: string): string {
  return value
    .normalize("NFD")
    // Diacritics go before the comparison: a founder typing "Muller" for
    // "Müller" on a keyboard that has no umlaut is not a different person.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,'`‘’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One token against another, allowing either side to be an initial. */
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length <= 2 && b.startsWith(a)) return true;
  if (b.length <= 2 && a.startsWith(b)) return true;
  return false;
}

/**
 * Deliberately generous. Returns true whenever the two could plausibly be the
 * same person, and the caller only ever uses a false to show a warning.
 */
export function namesLooselyMatch(typed: string, onFile: string | null | undefined): boolean {
  const a = normalise(typed);
  const b = normalise(onFile ?? "");
  // No name on file is not a mismatch. There is nothing to disagree with.
  if (!a || !b) return true;
  if (a === b) return true;

  const at = a.split(" ").filter(Boolean);
  const bt = b.split(" ").filter(Boolean);
  if (at.length === 0 || bt.length === 0) return true;

  // First and last agreeing carries the common cases: an abbreviated surname,
  // an initial for a first name, a dropped middle name.
  if (tokenMatch(at[0], bt[0]) && tokenMatch(at[at.length - 1], bt[bt.length - 1])) return true;

  // Or one is contained in the other, in any order: "Boritzki, Jack".
  if (at.every((x) => bt.some((y) => tokenMatch(x, y)))) return true;
  if (bt.every((y) => at.some((x) => tokenMatch(x, y)))) return true;

  return false;
}

const UI = "'DM Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";

export function FounderAttestationModal({
  open,
  startupId,
  onAttested,
  onCancel,
}: {
  open: boolean;
  startupId: string;
  /** Called once the server has recorded the attestation. */
  onAttested: (result: AttestationResult) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const tf = (key: string, fallback: string, vars?: Record<string, string | number>) => {
    const out = t(key, vars);
    return out === key ? fallback : out;
  };

  const [doc, setDoc] = useState<AttestationDocument | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(open && !busy, onCancel);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await fetch(`${ATTEST_ENDPOINT}?startupId=${encodeURIComponent(startupId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data?.text !== "string") {
        setDoc(null);
        setLoadFailed(true);
        return;
      }
      setDoc({
        text: data.text,
        version: typeof data.version === "string" ? data.version : "",
        sha256: typeof data.sha256 === "string" ? data.sha256 : "",
        profileName: typeof data.profileName === "string" ? data.profileName : null,
        attestedAt: typeof data.attestedAt === "string" ? data.attestedAt : null,
      });
    } catch {
      setDoc(null);
      setLoadFailed(true);
    }
  }, [startupId]);

  useEffect(() => {
    if (!open) return;
    setAgreed(false);
    setName("");
    setError(null);
    setBusy(false);
    void load();
  }, [open, load]);

  if (!open) return null;

  const trimmed = name.trim();
  const nameLooksWrong = trimmed.length >= 2 && !namesLooselyMatch(trimmed, doc?.profileName);
  const canSubmit = agreed && trimmed.length >= 2 && !!doc && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(ATTEST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The hash is not sent. The server renders the document again and
        // hashes what it rendered, so a client that sends a different one
        // cannot change what was signed.
        body: JSON.stringify({ startupId, signedName: trimmed, agreed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.attestedAt) {
        setError(data?.error || tf("errors.generic", "Something went wrong. Please try again."));
        return;
      }
      onAttested({
        attestedAt: data.attestedAt,
        version: typeof data.version === "string" ? data.version : (doc?.version ?? ""),
        sha256: typeof data.sha256 === "string" ? data.sha256 : (doc?.sha256 ?? ""),
      });
    } catch {
      setError(tf("errors.generic", "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attest-title"
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,22,18,0.6)", padding: "16px" }}
    >
      <div className="animate-fade-up" style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(26,22,18,0.25)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "24px 26px 0" }}>
          <div>
            <div className="ruled-label" style={{ marginBottom: "10px" }}>
              {tf("attest.eyebrow", "Your statement")}
            </div>
            <h3 id="attest-title" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "21px", color: "var(--cr-ink)", lineHeight: 1.2 }}>
              {tf("attest.title", "Confirm your listing")}
            </h3>
          </div>
          <button onClick={onCancel} disabled={busy} aria-label={tf("common.cancel", "Cancel")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", padding: 4, marginTop: -4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: "18px 26px 0" }}>
          <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "13.5px", lineHeight: 1.6, color: "var(--cr-ink-2)", marginBottom: "14px" }}>
            {tf(
              "attest.intro",
              "We do not audit your figures. Investors are told that plainly, and this statement is what stands behind them instead.",
            )}
          </p>

          {loadFailed && (
            <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "14px 16px", marginBottom: "14px" }}>
              <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", margin: 0 }}>
                {tf("attest.loadFailed", "The statement could not be loaded, so there is nothing to sign yet.")}
              </p>
              <button onClick={() => void load()} style={{ marginTop: "8px", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                {tf("common.retry", "Try again")}
              </button>
            </div>
          )}

          {doc && (
            <>
              {doc.attestedAt && (
                <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "12.5px", color: "var(--cr-ink-3)", marginBottom: "12px" }}>
                  {tf("attest.already", "You have already signed this wording. Signing again records a new statement and replaces the old one.")}
                </p>
              )}

              {/* The exact bytes being signed, shown as they will be hashed.
                  A summary here would defeat the hash: what is agreed has to
                  be what was read. */}
              <pre style={{ fontFamily: MONO, fontSize: "12px", lineHeight: 1.6, color: "var(--cr-ink-2)", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "14px 16px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "220px", overflowY: "auto" }}>
                {doc.text}
              </pre>

              <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginTop: "16px", padding: "12px 14px", background: "var(--cr-paper-3)", border: `1px solid ${agreed ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`, borderRadius: "4px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  style={{ marginTop: "3px", accentColor: "var(--cr-copper)", width: 15, height: 15, flexShrink: 0 }}
                />
                <span style={{ fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", lineHeight: 1.5 }}>
                  {tf("attest.checkbox", "I have read the statement above and I confirm it.")}
                </span>
              </label>

              <div style={{ marginTop: "14px" }}>
                <label htmlFor="attest-name" style={{ display: "block", fontFamily: UI, fontWeight: 500, fontSize: "10px", letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--cr-ink-4)", marginBottom: "6px" }}>
                  {tf("attest.nameLabel", "Type your full name")}
                </label>
                <input
                  id="attest-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  autoComplete="name"
                  placeholder={doc.profileName ?? tf("attest.namePlaceholder", "Your full name")}
                  style={{ width: "100%", fontFamily: UI, fontWeight: 400, fontSize: "14px", color: "var(--cr-ink)", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px 12px" }}
                />
                {nameLooksWrong && (
                  <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "12px", lineHeight: 1.5, color: "var(--cr-copper)", margin: "8px 0 0" }}>
                    {tf(
                      "attest.nameMismatch",
                      "This does not look like the name on your account. You can carry on if it is right, it is only worth checking.",
                      { profileName: doc.profileName ?? "" },
                    )}
                  </p>
                )}
              </div>
            </>
          )}

          {error && (
            <p role="alert" style={{ marginTop: "10px", fontFamily: UI, fontSize: "12.5px", color: "var(--cr-down)" }}>{error}</p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "18px 26px 22px" }}>
          <div className="flex flex-col-reverse sm:flex-row" style={{ gap: "10px", justifyContent: "flex-end" }}>
            <button onClick={onCancel} disabled={busy}
              style={{ height: "42px", padding: "0 18px", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
              {tf("common.cancel", "Cancel")}
            </button>
            <button onClick={() => void submit()} disabled={!canSubmit}
              style={{ height: "42px", padding: "0 22px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: UI, fontWeight: 600, fontSize: "13px", color: "#fff", cursor: canSubmit ? "pointer" : "default", opacity: canSubmit ? 1 : 0.5 }}>
              {busy ? tf("common.saving", "Saving...") : tf("attest.confirm", "Sign this statement")}
            </button>
          </div>
          <p style={{ fontFamily: MONO, fontWeight: 300, fontSize: "10.5px", lineHeight: 1.6, color: "var(--cr-ink-4)", textAlign: "center" }}>
            {tf(
              "attest.footer",
              "Signing records the time, your network address, the version of this wording, and a hash of the exact text above.",
            )}
            {doc?.version ? ` ${tf("attest.version", `Version ${doc.version}`, { version: doc.version })}` : ""}
            {doc?.sha256 ? ` ${doc.sha256.slice(0, 12)}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

export default FounderAttestationModal;
