"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Copy, Check, X } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";

type Invite = {
  id: string; code: string; invite_role: string; note: string | null;
  accepted_at: string | null; acceptedName: string | null;
  revoked_at: string | null; created_at: string; url: string;
};

/**
 * F: bring the other side.
 *
 * A two-sided marketplace has one problem before it has any others, and
 * everybody already on it knows people on the other side — founders have
 * investors who passed, investors have founders they liked but could not
 * fund. This is a link they copy and send themselves, through the
 * relationship that makes the invite worth anything. No email is sent: the
 * platform has no mail domain yet, and an invite that silently fails to send
 * is worse than none.
 */
export function InvitePanel({ defaultRole }: { defaultRole: "startup" | "investor" }) {
  const { t } = useTranslation();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [role, setRole] = useState<"startup" | "investor">(defaultRole);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/invites");
    setInvites(res.ok ? (await res.json()).invites ?? [] : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/invites", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, note }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    setNote("");
    void load();
    await copy(j.invite.url);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      notify.success(t("invite.copied"));
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is blocked in some embedded browsers. The link is on
      // screen either way, so this is a nudge rather than a failure.
      notify.error(t("invite.copyFailed"));
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/invites?id=${id}`, { method: "DELETE" });
    if (!res.ok) { notify.error((await res.json().catch(() => ({}))).error || t("errors.generic")); return; }
    void load();
  }

  const open = (invites ?? []).filter(i => !i.accepted_at && !i.revoked_at);
  const used = (invites ?? []).filter(i => i.accepted_at);

  return (
    <section className="border border-cr-p4 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus className="h-4 w-4 text-cr-copper" />
        <h2 className="font-bold text-cr-ink">{t("invite.title")}</h2>
      </div>
      <p className="text-sm text-cr-i4 mb-4">{t("invite.intro")}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={role} onChange={e => setRole(e.target.value as "startup" | "investor")}
          className="text-sm border rounded-lg px-2 py-1.5 bg-cr-paper text-cr-ink">
          <option value="investor">{t("invite.roleInvestor")}</option>
          <option value="startup">{t("invite.roleFounder")}</option>
        </select>
        <input value={note} onChange={e => setNote(e.target.value.slice(0, 120))}
          placeholder={t("invite.notePh")}
          className="flex-1 min-w-[160px] text-sm border rounded-lg px-3 py-1.5 bg-cr-paper text-cr-ink" />
        <button onClick={create} disabled={busy}
          className="text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50" style={{ background: "var(--cr-band-bg)", color: "var(--cr-band-ink)" }}>
          {t("invite.create")}
        </button>
      </div>

      {open.length > 0 && (
        <ul className="space-y-2 mb-4">
          {open.map(i => (
            <li key={i.id} className="flex items-center gap-2 border-t border-cr-p4 pt-2">
              <code className="text-[11px] font-mono text-cr-i3 truncate flex-1">{i.url}</code>
              {i.note && <span className="text-[11px] text-cr-i4 truncate max-w-[120px]">{i.note}</span>}
              <button onClick={() => copy(i.url)} title={t("invite.copy")} className="text-cr-copper shrink-0">
                {copied === i.url ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => revoke(i.id)} title={t("invite.revoke")} className="text-cr-i4 hover:text-red-600 shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {used.length > 0 && (
        <p className="text-xs text-cr-i3 border-t border-cr-p4 pt-2">
          {t("invite.joined", { count: used.length })}
          {used.some(u => u.acceptedName) && ` — ${used.map(u => u.acceptedName).filter(Boolean).join(", ")}`}
        </p>
      )}
      {invites !== null && open.length === 0 && used.length === 0 && (
        <p className="text-xs text-cr-i4">{t("invite.none")}</p>
      )}
    </section>
  );
}
