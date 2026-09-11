"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";
import { RefusalNotice, useRefusal, type Refusal } from "@/hooks/useRefusal";

/**
 * Founder → founder outreach from a listing. Founders viewing each other's
 * rounds had no way to talk at all — the thread schema supported it since
 * migration 012, but no button ever existed. Comparing notes with the
 * company one row over is how a marketplace becomes a community.
 */
export function FounderToFounder({ startupId }: { startupId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { readRefusal } = useRefusal();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  /** A refusal that names a way out needs the link and the reading time a toast has not. */
  function refuse(res: Response, json: unknown) {
    const r = readRefusal(res, json);
    if (r.href) setRefusal(r);
    else notify.error(r.message);
  }

  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true); setRefusal(null);
    const res = await fetch("/api/messages/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId, body }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { refuse(res, j); return; }
    notify.success(t("outreach.sent"));
    setOpen(false); setBody("");
    router.push(`/dashboard/messages?thread=${j.threadId}`);
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button onClick={async () => {
        if (busy) return;
        setRefusal(null);
        const res = await fetch("/api/messages/start", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startupId, open: true }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { refuse(res, j); return; }
        router.push(`/dashboard/messages?thread=${j.threadId}`);
      }}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--cr-paper-2)", border: "1px solid var(--cr-copper-br)", borderRadius: 4, padding: "8px 14px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: "var(--cr-copper)" }}>
        <ArrowRight style={{ width: 13, height: 13 }} /> {t("intro.make")}
      </button>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: 4, padding: "8px 16px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "var(--cr-ink-2)" }}>
        <MessageSquare style={{ width: 13, height: 13 }} /> {t("f2f.message")}
      </button>
      </div>
      {refusal && <RefusalNotice refusal={refusal} />}
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "min(340px, 90vw)" }}>
          <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={3}
            placeholder={t("f2f.placeholder")}
            style={{ width: "100%", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper)", color: "var(--cr-ink)", borderRadius: 4, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, resize: "vertical" }} />
          <button onClick={send} disabled={busy || !body.trim()}
            style={{ alignSelf: "flex-end", background: "var(--cr-copper)", color: "#fff", border: "none", borderRadius: 4, padding: "7px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer", opacity: busy || !body.trim() ? 0.6 : 1 }}>
            {busy ? t("common.saving") : t("f2f.send")}
          </button>
        </div>
      )}
    </div>
  );
}
