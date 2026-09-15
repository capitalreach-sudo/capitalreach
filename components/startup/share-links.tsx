"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { useReadOnly } from "@/components/dashboard/read-only";

type ShareLink = {
  id: string; token: string; url: string; label: string | null;
  grants_documents: boolean; expires_at: string | null; revoked_at: string | null;
  opens: number; last_opened_at: string | null; created_at: string;
};

/**
 * Share links for a founder's round, listed under Documents because that is
 * what they grant.
 *
 * The listing itself has always been public: anyone with the URL reads the
 * pitch. What a founder could not do was let the people in a WhatsApp group
 * open the DECK without each of them making an account, or find out whether
 * any of them did.
 *
 * The open count is the point. "I sent it to eleven angels" and "four of them
 * read it" are different facts, and only one of them tells you what to do
 * next.
 *
 * Inline-styled hairline rows to match the founder dashboard it mounts in
 * (components/dashboard/startup-dashboard-client.tsx), the same house idiom
 * as InvitePanel and WatchlistChanges -- this used to render through Ledger,
 * the Apple Design component system the dashboard itself was reverted away
 * from.
 */
export function ShareLinks() {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [withDocs, setWithDocs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const formId = useId();

  const load = useCallback(async () => {
    const res = await fetch("/api/startups/share").catch(() => null);
    setLinks(res && res.ok ? (await res.json()).links ?? [] : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (readOnly || busy) return;
    setBusy(true);
    const res = await fetch("/api/startups/share", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, grantsDocuments: withDocs }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { notify.error(j.error || t("errors.generic")); return; }
    // Said out loud rather than quietly handing back a weaker link than asked
    // for.
    if (j.documentsWithheld) notify.info(t("share.docsNeedGrowth"));
    setLabel("");
    setOpen(false);
    void load();
    if (j.link?.url) await copy(j.link.url);
  }

  // The copy result is invisible, so the button itself reports it and only a
  // failure is worth a toast.
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 2000);
    } catch {
      notify.error(t("share.copyFailed"));
    }
  }

  async function revoke(id: string) {
    if (readOnly) return;
    const res = await fetch(`/api/startups/share?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) { notify.error(t("errors.generic")); return; }
    void load();
  }

  if (links === null) return null;
  const live = links.filter(l => !l.revoked_at);
  if (readOnly && live.length === 0) return null;

  const countStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "11px",
    color: "var(--cr-ink-4)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };

  const urlStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "var(--cr-ink-3)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)",
  };

  return (
    <div>
      <h3 className="ruled-label" data-cr-visible="1" style={{ marginBottom: "16px" }}>{t("share.title")}</h3>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {!readOnly && (
          <div style={{ padding: "12px 0", borderTop: "1px solid var(--cr-rule)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <span style={titleStyle}>{t("share.create")}</span>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                  {t("share.intro")}
                </p>
              </div>
              <button
                type="button"
                className="cr-btn cr-btn--text"
                aria-expanded={open}
                aria-controls={open ? formId : undefined}
                onClick={() => setOpen((o) => !o)}
                style={{ flexShrink: 0 }}
              >
                {open ? t("common.cancel") : t("share.create")}
              </button>
            </div>
            {open && (
              <form id={formId} onSubmit={(e) => { e.preventDefault(); void create(); }} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
                <div>
                  <label htmlFor={`${formId}label`} className="sr-only">{t("share.labelPh")}</label>
                  <input
                    id={`${formId}label`}
                    className="cr-input"
                    value={label}
                    placeholder={t("share.labelPh")}
                    onChange={(e) => setLabel(e.target.value.slice(0, 120))}
                  />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-2)", cursor: "pointer" }}>
                  <input type="checkbox" checked={withDocs} onChange={(e) => setWithDocs(e.target.checked)} />
                  {t("share.includeDocs")}
                </label>
                <div>
                  <button type="submit" className="cr-btn cr-btn--primary" disabled={busy} aria-busy={busy || undefined}>
                    {busy ? t("common.saving") : t("share.create")}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        {live.map((l, idx) => (
          <div
            key={l.id}
            style={{
              display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px",
              padding: "12px 0", borderTop: (!readOnly || idx > 0) ? "1px solid var(--cr-rule)" : "none", flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              {l.label && <span style={titleStyle}>{l.label}</span>}
              <span style={{ ...urlStyle, display: "block", marginTop: l.label ? "4px" : 0 }}>{l.url}</span>
              {l.grants_documents && (
                <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                  {t("share.withDocs")}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexShrink: 0 }}>
              {/* Never a zero: an unopened link says so by saying nothing. */}
              {l.opens > 0 && <span style={countStyle}>{t("share.opens", { n: l.opens })}</span>}
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="cr-btn cr-btn--text" onClick={() => void copy(l.url)}>
                  {copied === l.url ? t("share.copied") : t("share.copy")}
                </button>
                {!readOnly && (
                  <button type="button" className="cr-btn cr-btn--text" onClick={() => void revoke(l.id)}>
                    {t("share.revoke")}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
