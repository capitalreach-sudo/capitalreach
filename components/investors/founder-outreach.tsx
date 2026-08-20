"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Handshake } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";

/**
 * B23: founder outbound from an investor profile — "Message" (opens a
 * one-shot composer → /api/messages/start) and "Add to pipeline" (opens
 * an intro-stage deal → /deals). Rendered by the server page for founder
 * viewers only; the pipeline button is hidden once a deal exists.
 */
export function FounderOutreach({ investorId, investorName, hasDeal }: { investorId: string; investorName: string; hasDeal: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"msg" | "deal" | null>(null);

  async function send() {
    if (!body.trim() || busy) return;
    setBusy("msg");
    const res = await fetch("/api/messages/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId, body }) });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    notify.success(t("outreach.sent"));
    setOpen(false); setBody("");
    router.push(`/dashboard/messages?startupId=${j.startupId}&investorId=${j.investorId}`);
  }
  async function addToPipeline() {
    if (busy) return;
    setBusy("deal");
    const res = await fetch("/api/deals/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ counterpartId: investorId }) });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    if (j.proposal) { notify.success(t("proposals.sent")); router.push("/deals"); return; }
    if (!j.deal) { notify.error(t("errors.generic")); return; }
    notify.success(t("outreach.addedToPipeline"));
    router.push(`/deals?deal=${j.deal.id}`);
  }

  const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 4, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button onClick={() => setOpen((o) => !o)} style={{ ...btn, background: "var(--cr-copper)", color: "#fff", border: "1px solid var(--cr-copper-d)" }}>
          <MessageSquare style={{ width: 13, height: 13 }} /> {t("outreach.message", { name: investorName })}
        </button>
        {!hasDeal && (
          <button onClick={addToPipeline} disabled={busy === "deal"} style={{ ...btn, background: "transparent", color: "var(--cr-copper)", border: "1px solid var(--cr-copper-br)", opacity: busy === "deal" ? 0.6 : 1 }}>
            <Handshake style={{ width: 13, height: 13 }} /> {busy === "deal" ? "…" : t("outreach.addToPipeline")}
          </button>
        )}
      </div>
      {open && (
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: 4, padding: 12, maxWidth: 520 }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} rows={4} maxLength={2000} placeholder={t("outreach.placeholder", { name: investorName })} autoFocus
            style={{ width: "100%", boxSizing: "border-box", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: 4, fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 13, color: "var(--cr-ink)", padding: "10px 12px", outline: "none", resize: "vertical" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 10.5, color: "var(--cr-ink-4)" }}>{t("messages.legalNote")}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setOpen(false)} style={{ ...btn, background: "transparent", color: "var(--cr-ink-3)", border: "1px solid var(--cr-rule-dark)", fontWeight: 400 }}>{t("common.cancel")}</button>
              <button onClick={send} disabled={!body.trim() || busy === "msg"} style={{ ...btn, background: "var(--cr-copper)", color: "#fff", border: "none", opacity: !body.trim() || busy === "msg" ? 0.5 : 1 }}>{busy === "msg" ? "…" : t("outreach.send")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
