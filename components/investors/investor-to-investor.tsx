"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";

/**
 * Investor → investor outreach from a profile. Co-investors could only talk
 * once a founder shared a deal between them; since 098 a direct thread needs
 * no startup anchor. Finding a co-investor IS the product for small-cheque
 * investors — someone writing €2k wants company on the cap table.
 */
export function InvestorToInvestor({ investorId }: { investorId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/messages/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investorId, body }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    notify.success(t("outreach.sent"));
    setOpen(false); setBody("");
    router.push(`/dashboard/messages?thread=${j.threadId}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button onClick={async () => {
        if (busy) return;
        const res = await fetch("/api/messages/start", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ investorId, open: true }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
        router.push(`/dashboard/messages?thread=${j.threadId}`);
      }}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--cr-paper-2)", border: "1px solid var(--cr-copper-br)", borderRadius: 4, padding: "8px 14px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: "var(--cr-copper)" }}>
        <ArrowRight style={{ width: 13, height: 13 }} /> {t("intro.make")}
      </button>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", background: "var(--cr-copper)", color: "#fff", border: "1px solid var(--cr-copper-d)", borderRadius: 4, padding: "8px 14px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12 }}>
        <MessageSquare style={{ width: 13, height: 13 }} /> {t("i2i.message")}
      </button>
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "min(340px, 90vw)" }}>
          <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={3}
            placeholder={t("i2i.placeholder")}
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
