"use client";

import { useCallback, useEffect, useState } from "react";
import { Handshake, Check, X } from "lucide-react";
import { EntityLogo } from "@/components/shared/entity-logo";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { formatMoney } from "@/lib/currency";

type Proposal = {
  id: string;
  direction: "incoming" | "outgoing";
  fromSide: "startup" | "investor";
  amount: number | null;
  currency: string | null;
  openingStatus: string;
  note: string | null;
  createdAt: string;
  counterpart: { kind: string; name: string; slug?: string; logoUrl: string | null; logoColor: string | null };
};

/**
 * The consent step, on the board it gates.
 *
 * Incoming requests sit ABOVE the pipeline because they are the one thing on
 * this page someone else is waiting on. Accepting creates the deal and both
 * sides see it; declining tells the sender plainly rather than leaving them
 * to infer it from silence.
 */
export function DealProposals({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const [incoming, setIncoming] = useState<Proposal[]>([]);
  const [outgoing, setOutgoing] = useState<Proposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/deals/proposals");
    if (!res.ok) { setLoaded(true); return; }
    const j = await res.json();
    setIncoming(j.incoming ?? []);
    setOutgoing(j.outgoing ?? []);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: "accept" | "decline" | "withdraw") {
    if (busy) return;
    setBusy(id);
    const res = await fetch("/api/deals/proposals", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); void load(); return; }
    if (action === "accept") notify.success(t("proposals.accepted"));
    void load();
    onChanged?.();
  }

  if (!loaded || (incoming.length === 0 && outgoing.length === 0)) return null;

  const row = (p: Proposal) => (
    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--cr-rule)", flexWrap: "wrap" }}>
      <EntityLogo name={p.counterpart.name} logoUrl={p.counterpart.logoUrl} logoColor={p.counterpart.logoColor} size={32} radius={4} />
      <div style={{ flex: 1, minWidth: 160 }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "var(--cr-ink)" }}>
          {p.counterpart.name}
          {p.amount != null && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: "var(--cr-copper)", marginLeft: 8 }}>
              {formatMoney(p.amount, p.currency, { compact: true })}
            </span>
          )}
        </p>
        {p.note && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--cr-ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>“{p.note}”</p>}
      </div>
      {p.direction === "incoming" ? (
        <span style={{ display: "inline-flex", gap: 6 }}>
          <button onClick={() => act(p.id, "accept")} disabled={busy === p.id}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--cr-up)", color: "#fff", border: "none", borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12 }}>
            <Check style={{ width: 12, height: 12 }} /> {t("proposals.accept")}
          </button>
          <button onClick={() => act(p.id, "decline")} disabled={busy === p.id}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", color: "var(--cr-ink-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12 }}>
            <X style={{ width: 12, height: 12 }} /> {t("proposals.decline")}
          </button>
        </span>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, color: "var(--cr-ink-4)" }}>{t("proposals.waiting")}</span>
          <button onClick={() => act(p.id, "withdraw")} disabled={busy === p.id}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, color: "var(--cr-ink-4)", textDecoration: "underline" }}>
            {t("proposals.withdraw")}
          </button>
        </span>
      )}
    </div>
  );

  return (
    <section style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: 4, padding: "14px 18px", marginBottom: 20 }}>
      <p style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "var(--cr-ink)", marginBottom: 2 }}>
        <Handshake style={{ width: 14, height: 14, color: "var(--cr-copper)" }} />
        {t("proposals.title")}
      </p>
      {incoming.map(row)}
      {outgoing.map(row)}
    </section>
  );
}
