"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Flag, Clock3 } from "lucide-react";
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

/* House card: one paper-2 slab, hairline border, 4px radius. Structure
   inside it is carried by rules, never by nested boxes. */
const CARD: React.CSSProperties = {
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};

const FIELD_LABEL = "block text-[11px] font-medium uppercase tracking-[0.07em] text-cr-i3 mb-2";
const FIELD = "w-full h-10 border border-cr-p4 rounded px-3 text-sm bg-cr-paper text-cr-ink";

/* Copper marks the live and the settled -- success is copper, never green;
   green/red are reserved for money direction. Ink greys carry the rest. */
const STATUS_STYLE: Record<string, { color: string; bg: string; br: string }> = {
  open:       { color: "var(--cr-copper)", bg: "var(--cr-copper-bg)", br: "var(--cr-copper-br)" },
  in_review:  { color: "var(--cr-ink-3)",  bg: "var(--cr-paper-3)",   br: "var(--cr-paper-4)"   },
  resolved:   { color: "var(--cr-copper)", bg: "var(--cr-copper-bg)", br: "var(--cr-copper-br)" },
  dismissed:  { color: "var(--cr-ink-4)",  bg: "var(--cr-paper-3)",   br: "var(--cr-paper-4)"   },
};

/* Badge: 3px radius, hairline border, Label type. */
const BADGE: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  borderRadius: "3px", padding: "3px 8px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
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
        <header className="mb-6">
          <Link href="/dashboard" className="inline-block mb-4">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> {t("common.back")}
            </Button>
          </Link>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("complaints.title")}</div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 36px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--cr-ink)" }}>
                {t("complaints.title")}
              </h1>
            </div>
            {/* The one primary action on this view; the form's submit takes
                over the role while the form is open. */}
            {!formOpen && (
              <Button onClick={() => setFormOpen(true)} className="gap-2">
                <Flag className="h-3.5 w-3.5" /> {t("complaints.new")}
              </Button>
            )}
          </div>
          <p className="mt-4 pt-4 text-sm font-light leading-relaxed text-cr-i3" style={{ borderTop: "1px solid var(--cr-rule)" }}>
            {t("complaints.intro")}
          </p>
        </header>

        {formOpen && (
          <form onSubmit={submit} className="mb-6 space-y-4 p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label">{t("complaints.new")}</h2>
            <div>
              <label htmlFor="cat" className={FIELD_LABEL}>{t("complaints.category")}</label>
              <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}
                className={FIELD}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`complaints.cat.${c}`)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="subj" className={FIELD_LABEL}>{t("complaints.subject")}</label>
              <input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)}
                maxLength={200} required minLength={3}
                placeholder={t("complaints.subjectPh")}
                className={FIELD} />
            </div>
            <div>
              <label htmlFor="body" className={FIELD_LABEL}>{t("complaints.body")}</label>
              <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)}
                maxLength={5000} required minLength={10} rows={5}
                placeholder={t("complaints.bodyPh")}
                className="w-full border border-cr-p4 rounded px-3 py-3 text-sm bg-cr-paper text-cr-ink resize-y" />
            </div>
            <div className="flex items-center gap-3 justify-end">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={busy}>{busy ? t("common.saving") : t("complaints.submit")}</Button>
            </div>
          </form>
        )}

        {rows === null ? (
          <p className="text-sm text-cr-i4">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center" style={CARD}>
            <span aria-hidden style={{ color: "var(--cr-copper)" }}>✦</span>
            <p className="mt-3 text-sm font-light text-cr-i3">{t("complaints.empty")}</p>
          </div>
        ) : (
          /* The register: one slab, complaints as ledger rows split by
             hairline rules -- no boxes-in-boxes. */
          <div style={CARD}>
            {rows.map((r, i) => {
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.open;
              return (
                <div key={r.id} className="p-4 sm:px-6" style={{ borderTop: i > 0 ? "1px solid var(--cr-rule)" : undefined }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-cr-ink">{r.subject}</p>
                      <p className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-cr-i4">{t(`complaints.cat.${r.category}`)}</span>
                        <span aria-hidden className="text-[10px] text-cr-i4">·</span>
                        <span className="mono text-[11px] font-medium text-cr-i4">{formatDate(r.created_at)}</span>
                      </p>
                    </div>
                    <span style={{ ...BADGE, color: st.color, background: st.bg, border: `1px solid ${st.br}` }}>
                      {r.status === "open" && <Clock3 style={{ width: 10, height: 10 }} />}
                      {t(`complaints.status.${r.status}`)}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] font-light leading-relaxed text-cr-i3 break-words whitespace-pre-wrap">{r.body}</p>
                  {r.resolution_note && (
                    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--cr-rule)" }}>
                      <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-cr-copper">{t("complaints.resolution")}</span>
                      <p className="mt-1 text-[13px] font-light leading-relaxed text-cr-i2 break-words">{r.resolution_note}</p>
                    </div>
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
