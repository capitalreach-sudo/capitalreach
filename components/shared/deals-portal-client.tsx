"use client";

import { useState } from "react";
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
}

export function DealsPortalClient({ deals, viewAs, revealIdentity = true, equityOffered = null, ownProfile, canExport = false }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  // Phase 1: an investor's first stage move on a founder-opened deal must be
  // preceded by the non-circumvention acknowledgment. The server answers 428
  // with the startup; we show the modal, record the ack, and retry the move.
  const [ackPending, setAckPending] = useState<{ startupId: string; startupName: string; retry: () => Promise<void> } | null>(null);
  const [closedMoment, setClosedMoment] = useState<{ amount: number | null; currency: string | null; counterpartName: string | null } | null>(null);

  async function handleDealStatusChange(dealId: string, status: DealStatus, reason?: string) {
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, status, reason }) });
    if (res.status === 428) {
      const data = await res.json().catch(() => ({}));
      if (data.code === "ACK_REQUIRED" && data.startupId) {
        setAckPending({
          startupId: data.startupId,
          startupName: data.startupName || t("deals.startupFallback"),
          retry: () => handleDealStatusChange(dealId, status, reason),
        });
        return;
      }
    }
    if (!res.ok) notify.error(t("dashboard.dealUpdateFailed")); else router.refresh();
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
    // file — say so rather than letting the revenue leak silently.
    if (data.feeNotBilled) notify.info(t("deals.feeNotBilled"));
    router.refresh();
  }

  async function handleSetCommitment(dealId: string, commitmentType: string, amount?: number | null) {
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, commitmentType, ...(amount !== undefined ? { amount } : {}) }) });
    if (!res.ok) notify.error(t("dashboard.dealUpdateFailed")); else { notify.success(t("deals.commitmentSaved")); router.refresh(); }
  }

  async function handleSetFollowUp(dealId: string, date: string | null) {
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, nextFollowUp: date }) });
    if (!res.ok) notify.error(t("deals.followUpSaveFailed")); else router.refresh();
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
    <DealKanban
      deals={deals}
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
    />
    </>
  );
}
