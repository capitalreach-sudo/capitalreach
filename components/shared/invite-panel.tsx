"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { useReadOnly } from "@/components/dashboard/read-only";
import { Ledger, LedgerCell, LedgerRow } from "@/components/ui/ledger";

type Invite = {
  id: string; code: string; invite_role: string; note: string | null;
  accepted_at: string | null; acceptedName: string | null;
  revoked_at: string | null; created_at: string; url: string;
};

/**
 * F: bring the other side.
 *
 * A two-sided marketplace has one problem before it has any others, and
 * everybody already on it knows people on the other side: founders have
 * investors who passed, investors have founders they liked but could not
 * fund. This is a link they copy and send themselves, through the
 * relationship that makes the invite worth anything. No email is sent: the
 * platform has no mail domain yet, and an invite that silently fails to send
 * is worse than none.
 *
 * It sits at the foot of a dashboard as one text link and opens in place,
 * because it is a thing a member does occasionally, not daily work. Both
 * dashboards mount it the same way:
 *
 *   <InvitePanel defaultRole="investor" />
 */
export function InvitePanel({ defaultRole }: { defaultRole: "startup" | "investor" }) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const [open, setOpen] = useState(false);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [role, setRole] = useState<"startup" | "investor">(defaultRole);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const panelId = useId();

  const load = useCallback(async () => {
    const res = await fetch("/api/invites").catch(() => null);
    setInvites(res && res.ok ? (await res.json()).invites ?? [] : []);
  }, []);
  useEffect(() => { if (open && invites === null) void load(); }, [open, invites, load]);

  async function create() {
    if (readOnly || busy) return;
    setBusy(true);
    const res = await fetch("/api/invites", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, note }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { notify.error(j.error || t("errors.generic")); return; }
    setNote("");
    void load();
    if (j.invite?.url) await copy(j.invite.url);
  }

  // Copying leaves nothing on screen to see, so the button says it happened.
  // Clipboard is blocked in some embedded browsers; the link is on screen
  // either way, so a failure is a nudge rather than an error state.
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 2000);
    } catch {
      notify.error(t("invite.copyFailed"));
    }
  }

  async function revoke(id: string) {
    if (readOnly) return;
    const res = await fetch(`/api/invites?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) { notify.error(t("errors.generic")); return; }
    void load();
  }

  const live = (invites ?? []).filter(i => !i.accepted_at && !i.revoked_at);
  const used = (invites ?? []).filter(i => i.accepted_at);
  const triggerLabel = defaultRole === "startup" ? t("invite.roleFounder") : t("invite.roleInvestor");

  const stack: React.CSSProperties = { display: "grid", gap: "0.75rem", maxInlineSize: "40rem", paddingBlockStart: "0.75rem" };
  const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" };
  const intro: React.CSSProperties = {
    margin: 0,
    maxWidth: "60ch",
    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
    fontSize: "0.8125rem",
    lineHeight: 1.4,
    color: "var(--cr-ink-3)",
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

  if (readOnly) return null;

  return (
    <div>
      <button
        type="button"
        className="cr-btn cr-btn--text"
        style={{ marginInlineStart: "-0.5rem" }}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {triggerLabel}
      </button>
      {open && (
        <div id={panelId} style={stack}>
          <p style={intro}>{t("invite.intro")}</p>
          <form style={row} onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <label htmlFor={`${panelId}role`} className="sr-only">{t("invite.title")}</label>
            <select
              id={`${panelId}role`}
              className="cr-select"
              value={role}
              onChange={(e) => setRole(e.target.value as "startup" | "investor")}
            >
              <option value="investor">{t("invite.roleInvestor")}</option>
              <option value="startup">{t("invite.roleFounder")}</option>
            </select>
            <label htmlFor={`${panelId}note`} className="sr-only">{t("invite.notePh")}</label>
            <input
              id={`${panelId}note`}
              className="cr-input"
              style={{ flex: "1 1 12rem", width: "auto", minWidth: 0 }}
              value={note}
              placeholder={t("invite.notePh")}
              onChange={(e) => setNote(e.target.value.slice(0, 120))}
            />
            <button type="submit" className="cr-btn" disabled={busy} aria-busy={busy || undefined}>
              {busy ? t("common.saving") : t("invite.create")}
            </button>
          </form>

          {live.length > 0 && (
            <Ledger columns="minmax(0,1fr) auto">
              {live.map((i) => (
                <LedgerRow
                  key={i.id}
                  trailing={
                    <>
                      <button type="button" className="cr-btn cr-btn--text" onClick={() => void copy(i.url)}>
                        {copied === i.url ? t("invite.copied") : t("invite.copy")}
                      </button>
                      <button type="button" className="cr-btn cr-btn--text" onClick={() => void revoke(i.id)}>
                        {t("invite.revoke")}
                      </button>
                    </>
                  }
                >
                  <LedgerCell primary>
                    <span style={urlStyle}>{i.url}</span>
                    {i.note && <span className="cr-row-sub">{i.note}</span>}
                  </LedgerCell>
                </LedgerRow>
              ))}
            </Ledger>
          )}

          {used.length > 0 && (
            <p style={intro}>
              {t("invite.joined", { count: used.length })}
              {used.some(u => u.acceptedName) && `: ${used.map(u => u.acceptedName).filter(Boolean).join(", ")}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
