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
}

export function DealsPortalClient({ deals, viewAs, revealIdentity = true, equityOffered = null, ownProfile }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  async function handleDealStatusChange(dealId: string, status: DealStatus) {
    const res = await fetch("/api/deals/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, status }) });
    if (!res.ok) notify.error(t("dashboard.dealUpdateFailed")); else router.refresh();
  }

  async function handleDealClose(dealId: string, amount: number, currency: string) {
    const res = await fetch("/api/deals/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, amount, currency }) });
    const data = await res.json();
    if (!res.ok) { notify.error(data.error || t("dashboard.dealCloseFailed")); }
    else { notify.success(amount ? t("dashboard.dealClosedAt", { amount: formatMoney(amount, currency) }) : t("dashboard.dealClosed")); router.refresh(); }
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
    />
  );
}
