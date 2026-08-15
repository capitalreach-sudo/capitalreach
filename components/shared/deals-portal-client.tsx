"use client";

import { useRouter } from "next/navigation";
import { DealKanban, type OwnProfile } from "@/components/shared/deal-kanban";
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

  async function handleDealStatusChange(dealId: string, status: DealStatus, reason?: string) {
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, status, reason }) });
    if (!res.ok) notify.error(t("dashboard.dealUpdateFailed")); else router.refresh();
  }

  async function handleDealClose(dealId: string, amount: number, currency: string) {
    const res = await fetch("/api/deals/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, amount, currency }) });
    const data = await res.json();
    if (!res.ok) { notify.error(data.error || t("dashboard.dealCloseFailed")); return; }
    notify.success(amount ? t("dashboard.dealClosedAt", { amount: formatMoney(amount, currency) }) : t("dashboard.dealClosed"));
    // The fee couldn't be invoiced because the founder has no payment method on
    // file — say so rather than letting the revenue leak silently.
    if (data.feeNotBilled) notify.info(t("deals.feeNotBilled"));
    router.refresh();
  }

  async function handleSetFollowUp(dealId: string, date: string | null) {
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, nextFollowUp: date }) });
    if (!res.ok) notify.error(t("deals.followUpSaveFailed")); else router.refresh();
  }

  return (
    <DealKanban
      deals={deals}
      onStatusChange={handleDealStatusChange}
      onDealClose={handleDealClose}
      viewAs={viewAs}
      revealIdentity={revealIdentity}
      equityOffered={equityOffered}
      ownProfile={ownProfile}
      canExport={canExport}
      onSetFollowUp={handleSetFollowUp}
    />
  );
}
