"use client";

import { useCallback, useEffect, useState } from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";

type Note = { id: string; body: string; created_at: string; admin_id: string | null; authorName: string | null };

/**
 * E53: the operator's memory of an account.
 *
 * Deliberately plain — this is a notebook, not a feature. What matters is
 * that it is attached to the record rather than to whoever happened to
 * handle it, and that the person it is about can never read it (admin_notes
 * has RLS on with no permissive policy).
 */
export function AdminNotes({ targetType, targetId }: {
  targetType: "profile" | "startup" | "investor" | "deal";
  targetId: string;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/notes?targetType=${targetType}&targetId=${targetId}`);
    setNotes(res.ok ? (await res.json()).notes ?? [] : []);
  }, [targetType, targetId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/admin/notes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, body: draft }),
    });
    setBusy(false);
    if (!res.ok) { notify.error((await res.json().catch(() => ({}))).error || t("errors.generic")); return; }
    setDraft(""); void load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/notes?id=${id}`, { method: "DELETE" });
    if (!res.ok) { notify.error((await res.json().catch(() => ({}))).error || t("errors.generic")); return; }
    void load();
  }

  return (
    <section className="border border-cr-p4 rounded-xl p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <StickyNote className="h-4 w-4 text-cr-copper" />
        <h3 className="text-sm font-semibold text-cr-ink">{t("adminNotes.title")}</h3>
        <span className="text-[11px] text-cr-i4">{t("adminNotes.privateHint")}</span>
      </div>

      <div className="flex gap-2 mb-3">
        <input value={draft} onChange={e => setDraft(e.target.value.slice(0, 2000))}
          onKeyDown={e => { if (e.key === "Enter") void add(); }}
          placeholder={t("adminNotes.placeholder")}
          className="flex-1 text-sm border rounded-lg px-3 py-1.5 bg-cr-paper text-cr-ink" />
        <button onClick={add} disabled={busy || !draft.trim()}
          className="text-xs font-semibold text-cr-copper disabled:opacity-40">{t("adminNotes.add")}</button>
      </div>

      {notes === null ? (
        <p className="text-xs text-cr-i4">{t("common.loading")}</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-cr-i4">{t("adminNotes.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {notes.map(n => (
            <li key={n.id} className="flex items-start justify-between gap-3 border-t border-cr-p4 pt-2">
              <div className="min-w-0">
                <p className="text-sm text-cr-ink break-words">{n.body}</p>
                <p className="text-[11px] text-cr-i4 mt-0.5">
                  {n.authorName ?? t("adminNotes.unknownAuthor")} · {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
              <button onClick={() => remove(n.id)} title={t("adminNotes.deleteOwn")}
                className="text-cr-i4 hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
