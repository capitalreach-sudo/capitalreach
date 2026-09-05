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
export function DealProposals({ onChanged, variant = "strip" }: { onChanged?: () => void; variant?: "strip" | "column" }) {
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

  if (variant === "strip" && (!loaded || (incoming.length === 0 && outgoing.length === 0))) return null;

  const row = (p: Proposal) => (
    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--cr-rule)", flexWrap: "wrap" }}>
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
        <span style={{ display: "inline-flex", gap: 12 }}>
          <button onClick={() => act(p.id, "accept")} disabled={busy === p.id}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--cr-copper)", color: "var(--cr-band-ink)", border: "none", borderRadius: 999, minHeight: 40, padding: "0 16px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13 }}>
            <Check style={{ width: 12, height: 12 }} /> {t("proposals.accept")}
          </button>
          <button onClick={() => act(p.id, "decline")} disabled={busy === p.id}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: "var(--cr-ink)", border: "1px solid var(--cr-paper-4)", borderRadius: 999, minHeight: 40, padding: "0 16px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: 13 }}>
            <X style={{ width: 12, height: 12 }} /> {t("proposals.decline")}
          </button>
        </span>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, color: "var(--cr-ink-4)" }}>{t("proposals.waiting")}</span>
          <button onClick={() => act(p.id, "withdraw")} disabled={busy === p.id}
            style={{ display: "inline-flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", minHeight: 40, padding: "0 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, color: "var(--cr-ink-4)", textDecoration: "underline" }}>
            {t("proposals.withdraw")}
          </button>
        </span>
      )}
    </div>
  );

  if (variant === "column") {
    const all = [...incoming, ...outgoing];
    return (
      <div style={{ width: "264px", flexShrink: 0, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 260px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: 3, padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cr-copper)" }}>
            <Handshake style={{ width: 11, height: 11 }} /> {t("deals.colProposal")}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)" }}>{all.length}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", paddingRight: "2px", minHeight: 0 }}>
          {all.length === 0 ? (
            <div style={{ border: "1px dashed var(--cr-rule-dark)", borderRadius: 4, padding: "16px 12px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 11, color: "var(--cr-ink-4)" }}>
              <span aria-hidden style={{ display: "block", color: "var(--cr-copper)", marginBottom: 8 }}>✦</span>
              {t("proposals.emptyColumn")}
            </div>
          ) : all.map(p => (
            <div key={p.id} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-copper-br)", borderRadius: 4, padding: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <EntityLogo name={p.counterpart.name} logoUrl={p.counterpart.logoUrl} logoColor={p.counterpart.logoColor} size={28} radius={4} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.counterpart.name}</p>
                  {p.amount != null && (
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 11, color: "var(--cr-copper)" }}>{formatMoney(p.amount, p.currency, { compact: true })}</p>
                  )}
                </div>
              </div>
              {p.note && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "var(--cr-ink-3)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{p.note}”</p>}
              {p.direction === "incoming" ? (
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => act(p.id, "accept")} disabled={busy === p.id}
                    style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, background: "var(--cr-copper)", color: "var(--cr-band-ink)", border: "none", borderRadius: 999, minHeight: 40, padding: 0, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12 }}>
                    <Check style={{ width: 11, height: 11 }} /> {t("proposals.accept")}
                  </button>
                  <button onClick={() => act(p.id, "decline")} disabled={busy === p.id}
                    style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", color: "var(--cr-ink)", border: "1px solid var(--cr-paper-4)", borderRadius: 999, minHeight: 40, padding: 0, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: 12 }}>
                    {t("proposals.decline")}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, color: "var(--cr-ink-4)" }}>{t("proposals.waiting")}</span>
                  <button onClick={() => act(p.id, "withdraw")} disabled={busy === p.id}
                    style={{ display: "inline-flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", minHeight: 40, padding: "0 8px", marginRight: -8, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, color: "var(--cr-ink-4)", textDecoration: "underline" }}>
                    {t("proposals.withdraw")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: 4, padding: "16px", marginBottom: 24 }}>
      <p className="ruled-label" style={{ marginBottom: 4 }}>
        {t("proposals.title")}
      </p>
      {incoming.map(row)}
      {outgoing.map(row)}
    </section>
  );
}
