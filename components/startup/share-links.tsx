"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Copy, Check, X, Eye } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";

type ShareLink = {
  id: string; token: string; url: string; label: string | null;
  grants_documents: boolean; expires_at: string | null; revoked_at: string | null;
  opens: number; last_opened_at: string | null; created_at: string;
};

/**
 * Share links for a founder's round.
 *
 * The listing itself has always been public — anyone with the URL reads the
 * pitch. What a founder could not do was let the people in a WhatsApp group
 * open the DECK without each of them making an account, or find out whether
 * any of them did.
 *
 * The open count is the point. "I sent it to eleven angels" and "four of them
 * read it" are different facts, and only one of them tells you what to do next.
 */
export function ShareLinks() {
  const { t } = useTranslation();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [label, setLabel] = useState("");
  const [withDocs, setWithDocs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/startups/share");
    setLinks(res.ok ? (await res.json()).links ?? [] : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/startups/share", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, grantsDocuments: withDocs }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    // Said out loud rather than quietly handing back a weaker link than asked
    // for.
    if (j.documentsWithheld) notify.info(t("share.docsNeedGrowth"));
    setLabel("");
    void load();
    await copy(j.link.url);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      notify.success(t("share.copied"));
      setTimeout(() => setCopied(null), 2000);
    } catch {
      notify.error(t("share.copyFailed"));
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/startups/share?id=${id}`, { method: "DELETE" });
    if (!res.ok) { notify.error(t("errors.generic")); return; }
    void load();
  }

  if (links === null) return null;
  const live = links.filter(l => !l.revoked_at);

  return (
    <section style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginTop: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Link2 style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("share.title")}</h3>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: 14, lineHeight: 1.5 }}>
        {t("share.intro")}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <input value={label} onChange={e => setLabel(e.target.value.slice(0, 120))}
          placeholder={t("share.labelPh")}
          style={{ flex: "1 1 180px", minWidth: 150, background: "var(--cr-paper)", border: "1px solid var(--cr-rule)", borderRadius: 4, padding: "7px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: "12.5px", color: "var(--cr-ink)", outline: "none" }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
          <input type="checkbox" checked={withDocs} onChange={e => setWithDocs(e.target.checked)} />
          {t("share.includeDocs")}
        </label>
        <button onClick={create} disabled={busy}
          style={{ background: "var(--cr-ink)", color: "var(--cr-paper)", border: "none", borderRadius: 4, padding: "7px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {t("share.create")}
        </button>
      </div>

      {live.length === 0 ? (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-4)" }}>{t("share.none")}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {live.map(l => (
            <li key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--cr-rule)", paddingTop: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {l.label && <span>{l.label}</span>}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <Eye style={{ width: 10, height: 10 }} />
                    {t("share.opens", { n: l.opens })}
                  </span>
                  {l.grants_documents && <span style={{ color: "var(--cr-copper)" }}>{t("share.withDocs")}</span>}
                </p>
              </div>
              <button onClick={() => copy(l.url)} title={t("share.copy")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-copper)", display: "flex", padding: 2 }}>
                {copied === l.url ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
              </button>
              <button onClick={() => revoke(l.id)} title={t("share.revoke")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", padding: 2 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
