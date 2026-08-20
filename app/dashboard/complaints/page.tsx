"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Flag, CheckCircle2, Clock3 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";

/**
 * Filing and tracking complaints. The counterpart to /report (content) —
 * this is "something went wrong for me", with a lifecycle the filer watches:
 * open → in review → resolved/dismissed, each move arriving as a
 * notification. The status history stays on this page forever; a complaints
 * box that swallows complaints is worse than none.
 */
type Complaint = {
  id: string; category: string; subject: string; body: string;
  status: string; resolution_note: string | null; created_at: string; resolved_at: string | null;
};

const CATEGORIES = ["platform", "user_conduct", "deal_dispute", "billing", "data_privacy", "other"];

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  open:       { color: "var(--cr-copper)", bg: "var(--cr-copper-bg)" },
  in_review:  { color: "var(--cr-ink-3)",  bg: "var(--cr-paper-3)"  },
  resolved:   { color: "var(--cr-up)",     bg: "var(--cr-up-bg)"    },
  dismissed:  { color: "var(--cr-ink-4)",  bg: "var(--cr-paper-3)"  },
};

export default function ComplaintsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Complaint[] | null>(null);
  const [category, setCategory] = useState("platform");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/complaints");
    setRows(res.ok ? (await res.json()).complaints ?? [] : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/complaints", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, subject, body }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error((await res?.json().catch(() => ({})))?.error || t("errors.generic"));
      return;
    }
    notify.success(t("complaints.filed"));
    setSubject(""); setBody(""); setFormOpen(false);
    void load();
  }

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> {t("common.back")}
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-cr-ink">{t("complaints.title")}</h1>
          </div>
          {!formOpen && (
            <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
              <Flag className="h-3.5 w-3.5" /> {t("complaints.new")}
            </Button>
          )}
        </div>
        <p className="text-sm text-cr-i3 mb-6">{t("complaints.intro")}</p>

        {formOpen && (
          <form onSubmit={submit} className="bg-cr-paper border rounded-2xl p-5 mb-6 space-y-4">
            <div>
              <label htmlFor="cat" className="block text-xs font-semibold text-cr-i3 mb-1.5">{t("complaints.category")}</label>
              <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-cr-p4 rounded-lg px-3 py-2 text-sm bg-cr-paper text-cr-ink">
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`complaints.cat.${c}`)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="subj" className="block text-xs font-semibold text-cr-i3 mb-1.5">{t("complaints.subject")}</label>
              <input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)}
                maxLength={200} required minLength={3}
                placeholder={t("complaints.subjectPh")}
                className="w-full border border-cr-p4 rounded-lg px-3 py-2 text-sm bg-cr-paper text-cr-ink" />
            </div>
            <div>
              <label htmlFor="body" className="block text-xs font-semibold text-cr-i3 mb-1.5">{t("complaints.body")}</label>
              <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)}
                maxLength={5000} required minLength={10} rows={5}
                placeholder={t("complaints.bodyPh")}
                className="w-full border border-cr-p4 rounded-lg px-3 py-2 text-sm bg-cr-paper text-cr-ink resize-y" />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" size="sm" disabled={busy}>{busy ? t("common.saving") : t("complaints.submit")}</Button>
            </div>
          </form>
        )}

        {rows === null ? (
          <p className="text-sm text-cr-i4">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <div className="bg-cr-paper border rounded-2xl p-10 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-cr-i4" />
            <p className="text-sm text-cr-i4">{t("complaints.empty")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.open;
              return (
                <div key={r.id} className="bg-cr-paper border rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-cr-ink text-sm">{r.subject}</p>
                      <p className="text-xs text-cr-i4">
                        {t(`complaints.cat.${r.category}`)} · {formatDate(r.created_at)}
                      </p>
                    </div>
                    <span style={{ color: st.color, background: st.bg, borderRadius: 4, padding: "3px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {r.status === "open" && <Clock3 style={{ width: 10, height: 10 }} />}
                      {t(`complaints.status.${r.status}`)}
                    </span>
                  </div>
                  <p className="text-[12px] text-cr-i3 mt-1.5 break-words whitespace-pre-wrap">{r.body}</p>
                  {r.resolution_note && (
                    <p className="text-[12px] text-cr-i2 mt-2 border-t border-cr-p4 pt-2">
                      <span className="font-semibold">{t("complaints.resolution")}:</span> {r.resolution_note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
