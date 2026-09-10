"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DealKanban, type OwnProfile } from "@/components/shared/deal-kanban";
import { DealClosedMoment } from "@/components/shared/deal-closed-moment";
import { NonCircumventionModal } from "@/components/ui/NonCircumventionModal";
import { notify } from "@/components/ui/toast-notify";
import { formatMoney } from "@/lib/currency";
import type { Deal, DealStatus } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  deals: Deal[];
  viewAs: "startup" | "investor" | "admin";
  revealIdentity?: boolean;
  equityOffered?: number | null;
  ownProfile?: OwnProfile;
  canExport?: boolean;
  /** Admin who is also a participant: ids of their own entities. */
  myEntityIds?: string[];
}

export function DealsPortalClient({ deals, viewAs, revealIdentity = true, equityOffered = null, ownProfile, canExport = false, myEntityIds = [] }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  // Two lenses for the operator-participant: the platform ledger, and their
  // own pipeline inside it. Pure client-side cut of the same rows.
  const [scope, setScope] = useState<"all" | "mine">("all");
  const scopedDeals = viewAs === "admin" && scope === "mine" && myEntityIds.length
    ? deals.filter(d => myEntityIds.includes(d.startup_id) || myEntityIds.includes(d.investor_id))
    : deals;

  // Phase 1: an investor's first stage move on a founder-opened deal must be
  // preceded by the non-circumvention acknowledgment. The server answers 428
  // with the startup; we show the modal, record the ack, and retry the move.
  const [ackPending, setAckPending] = useState<{ startupId: string; startupName: string; retry: () => Promise<void> } | null>(null);
  const [closedMoment, setClosedMoment] = useState<{ amount: number | null; currency: string | null; counterpartName: string | null } | null>(null);

  // The stage the board has been asked for but has not been given yet. The
  // card wears it while the request is out, so the most consequential click on
  // the page answers on the click rather than a round trip later.
  const [moving, setMoving] = useState<{ id: string; status: DealStatus } | null>(null);
  const [, startTransition] = useTransition();

  // The board is a server render, so a fresh `deals` array IS the new rows
  // arriving. Holding the answered state until then means the card never
  // flickers back to its old stage in the gap between fetch and refresh.
  useEffect(() => { setMoving(null); }, [deals]);

  async function handleDealStatusChange(dealId: string, status: DealStatus, reason?: string) {
    setMoving({ id: dealId, status });
    // A rejected fetch (offline, DNS, a dropped connection) throws rather than
    // answering, and every branch below is written for an answer. Without this
    // the card keeps the dimmed, pointer-events-none state forever and the only
    // way out is a reload. An optimistic control that cannot fail is worse than
    // no optimistic control.
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, status, reason }) })
      .catch(() => null);
    if (!res) { setMoving(null); notify.error(t("dashboard.dealUpdateFailed")); return; }
    if (res.status === 428) {
      const data = await res.json().catch(() => ({}));
      if (data.code === "ACK_REQUIRED" && data.startupId) {
        // Not a move yet: the acknowledgment gates it. Hand the card back
        // before the modal opens rather than leaving it dimmed underneath.
        setMoving(null);
        setAckPending({
          startupId: data.startupId,
          startupName: data.startupName || t("deals.startupFallback"),
          retry: () => handleDealStatusChange(dealId, status, reason),
        });
        return;
      }
    }
    if (!res.ok) { setMoving(null); notify.error(t("dashboard.dealUpdateFailed")); return; }
    startTransition(() => router.refresh());
  }

  async function handleDealClose(dealId: string, amount: number, currency: string) {
    const res = await fetch("/api/deals/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, amount, currency }) });
    const data = await res.json();
    if (!res.ok) {
      // The one refusal with a next step: no signed contract yet.
      notify.error(data.code === "CONTRACT_REQUIRED" ? t("deals.contractRequired") : (data.error || t("dashboard.dealCloseFailed")));
      return;
    }
    if (data.proposed) { notify.success(t("deals.closeProposedSent")); router.refresh(); return; }
    // The moment itself. Months of work deserve more than a four-second toast.
    const closedDeal = deals.find(d => d.id === dealId);
    const counterpartName = viewAs === "startup"
      ? ((closedDeal?.investor as { display_name?: string | null; firm_name?: string | null } | undefined)?.firm_name
         ?? (closedDeal?.investor as { display_name?: string | null } | undefined)?.display_name ?? null)
      : ((closedDeal?.startup as { name?: string } | undefined)?.name ?? null);
    setClosedMoment({ amount: amount || null, currency, counterpartName });
    // The fee couldn't be invoiced because the founder has no payment method on
    // file -- say so rather than letting the revenue leak silently.
    if (data.feeNotBilled) notify.info(t("deals.feeNotBilled"));
    router.refresh();
  }

  // Both answer with whether the record took it, so the control that was
  // clicked can show the new value at once and put the old one back if the
  // server refuses. Same contract PublicInterestToggle already works to.
  async function handleSetCommitment(dealId: string, commitmentType: string, amount?: number | null): Promise<boolean> {
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, commitmentType, ...(amount !== undefined ? { amount } : {}) }) })
      .catch(() => null);
    // The caller puts the old value back only on an explicit false, so a throw
    // that returned undefined would leave the chip showing a commitment the
    // record never took.
    if (!res || !res.ok) { notify.error(t("dashboard.dealUpdateFailed")); return false; }
    notify.success(t("deals.commitmentSaved"));
    startTransition(() => router.refresh());
    return true;
  }

  async function handleSetFollowUp(dealId: string, date: string | null): Promise<boolean> {
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, nextFollowUp: date }) })
      .catch(() => null);
    if (!res || !res.ok) { notify.error(t("deals.followUpSaveFailed")); return false; }
    startTransition(() => router.refresh());
    return true;
  }

  return (
    <>
    {closedMoment && (
      <DealClosedMoment
        amount={closedMoment.amount}
        currency={closedMoment.currency}
        counterpartName={closedMoment.counterpartName}
        onDone={() => setClosedMoment(null)}
      />
    )}
    {ackPending && (
      <NonCircumventionModal
        open
        startupId={ackPending.startupId}
        startupName={ackPending.startupName}
        onCancel={() => setAckPending(null)}
        onConfirmed={() => { const r = ackPending.retry; setAckPending(null); r(); }}
      />
    )}
    {/* The consent step, above the board it gates. Admin sees every deal
        anyway and answers for neither side, so the strip is participant-only. */}
    {viewAs === "admin" && myEntityIds.length > 0 && (() => {
      const mineCount = deals.filter(d => myEntityIds.includes(d.startup_id) || myEntityIds.includes(d.investor_id)).length;
      // Two SECTIONS, not a widget: the platform ledger and your own
      // pipeline inside it, underlined like the tabs they are.
      return (
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: 24 }}>
          {([["all", t("deals.scopeAll"), deals.length], ["mine", t("deals.scopeMine"), mineCount]] as const).map(([v, label, n]) => (
            <button key={v} onClick={() => setScope(v)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                borderBottom: scope === v ? "2px solid var(--cr-copper)" : "2px solid transparent",
                marginBottom: -1, padding: "8px 16px", minHeight: 40,
                fontFamily: "'DM Sans', sans-serif", fontWeight: scope === v ? 700 : 400, fontSize: 14,
                color: scope === v ? "var(--cr-ink)" : "var(--cr-ink-4)",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}>
              {label}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 11, color: scope === v ? "var(--cr-copper)" : "var(--cr-ink-4)" }}>{n}</span>
            </button>
          ))}
        </div>
      );
    })()}
    <DealKanban
      deals={scopedDeals}
      onProposalsChanged={() => router.refresh()}
      onStatusChange={handleDealStatusChange}
      onDealClose={handleDealClose}
      viewAs={viewAs}
      revealIdentity={revealIdentity}
      equityOffered={equityOffered}
      ownProfile={ownProfile}
      canExport={canExport}
      onSetFollowUp={handleSetFollowUp}
      onSetCommitment={handleSetCommitment}
      movingDeal={moving}
    />
    </>
  );
}
