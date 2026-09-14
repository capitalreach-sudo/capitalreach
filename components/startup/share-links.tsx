"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { useReadOnly } from "@/components/dashboard/read-only";
import { Ledger, LedgerCell, LedgerRow } from "@/components/ui/ledger";

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
    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
    fontSize: "0.8125rem",
    lineHeight: 1.4,
    color: "var(--cr-ink-3)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };

  const urlStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace",
    fontSize: "0.8125rem",
    lineHeight: 1.4,
    color: "var(--cr-ink-3)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <div className="sd-group">
      <div className="sd-group__head">
        <h3 className="sd-group__title">{t("share.title")}</h3>
      </div>
      <Ledger columns="minmax(0,1fr) auto auto">
        {!readOnly && (
          <LedgerRow
            className="sd-expandable"
            trailing={
              <button
                type="button"
                className="cr-btn cr-btn--text"
                aria-expanded={open}
                aria-controls={open ? formId : undefined}
                onClick={() => setOpen((o) => !o)}
              >
                {open ? t("common.cancel") : t("share.create")}
              </button>
            }
          >
            <LedgerCell primary>
              <span className="cr-row-title">{t("share.create")}</span>
              <span className="cr-row-sub sd-wrap">{t("share.intro")}</span>
            </LedgerCell>
            <LedgerCell className={open ? "sd-span" : undefined}>
              {open && (
                <form id={formId} className="sd-form" onSubmit={(e) => { e.preventDefault(); void create(); }}>
                  <label htmlFor={`${formId}label`} className="sr-only">{t("share.labelPh")}</label>
                  <input
                    id={`${formId}label`}
                    className="cr-input"
                    value={label}
                    placeholder={t("share.labelPh")}
                    onChange={(e) => setLabel(e.target.value.slice(0, 120))}
                  />
                  <label className="sd-check">
                    <input type="checkbox" checked={withDocs} onChange={(e) => setWithDocs(e.target.checked)} />
                    {t("share.includeDocs")}
                  </label>
                  <div className="sd-form__actions">
                    <button type="submit" className="cr-btn cr-btn--primary" disabled={busy} aria-busy={busy || undefined}>
                      {busy ? t("common.saving") : t("share.create")}
                    </button>
                  </div>
                </form>
              )}
            </LedgerCell>
          </LedgerRow>
        )}
        {live.map((l) => (
          <LedgerRow
            key={l.id}
            trailing={
              <>
                <button type="button" className="cr-btn cr-btn--text" onClick={() => void copy(l.url)}>
                  {copied === l.url ? t("share.copied") : t("share.copy")}
                </button>
                {!readOnly && (
                  <button type="button" className="cr-btn cr-btn--text" onClick={() => void revoke(l.id)}>
                    {t("share.revoke")}
                  </button>
                )}
              </>
            }
          >
            <LedgerCell primary>
              {l.label && <span className="cr-row-title">{l.label}</span>}
              <span style={urlStyle}>{l.url}</span>
              {l.grants_documents && <span className="cr-row-sub">{t("share.withDocs")}</span>}
            </LedgerCell>
            {/* Never a zero: an unopened link says so by saying nothing. */}
            <LedgerCell align="end">
              {l.opens > 0 ? <span style={countStyle}>{t("share.opens", { n: l.opens })}</span> : null}
            </LedgerCell>
          </LedgerRow>
        ))}
      </Ledger>
    </div>
  );
}
