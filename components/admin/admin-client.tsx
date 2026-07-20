"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, XCircle, AlertCircle, DollarSign, Users, Building2, TrendingUp } from "lucide-react";
import { formatCurrency, formatDate, STATUS_COLORS } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { Startup, Investor, Deal } from "@/types";

interface Props {
  pendingStartups: (Startup & { owner: { email: string; full_name: string } })[];
  allStartups: (Startup & { owner: { email: string; full_name: string } })[];
  allInvestors: (Investor & { owner: { email: string; full_name: string; subscription_tier: string } })[];
  allDeals: (Deal & { startup: { name: string }; investor: { slug: string } })[];
  stats: { totalStartups: number; totalInvestors: number; startupMrr: number; investorMrr: number };
}

export function AdminClient({ pendingStartups, allStartups, allInvestors, allDeals, stats }: Props) {
  const { t } = useTranslation();
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toast } = useToast();

  async function approveStartup(id: string) {
    setProcessingId(id);
    const res = await fetch("/api/admin/startup/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: id }),
    });
    if (res.ok) toast({ title: t("admin.toastApproved") });
    else toast({ title: t("admin.toastApproveFailed"), variant: "destructive" });
    setProcessingId(null);
    window.location.reload();
  }

  async function rejectStartup(id: string) {
    const reason = rejectionReason[id];
    if (!reason) { toast({ title: t("admin.toastRejectReasonRequired"), variant: "destructive" }); return; }
    setProcessingId(id);
    const res = await fetch("/api/admin/startup/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: id, reason }),
    });
    if (res.ok) toast({ title: t("admin.toastRejected") });
    else toast({ title: t("admin.toastRejectFailed"), variant: "destructive" });
    setProcessingId(null);
    window.location.reload();
  }

  async function suspendStartup(id: string) {
    const res = await fetch("/api/admin/startup/suspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: id }),
    });
    if (res.ok) window.location.reload();
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
          <AlertCircle className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-cr-ink">{t("admin.panelTitle")}</h1>
          <p className="text-cr-i3 text-sm">{t("admin.panelSub")}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: t("admin.statTotalStartups"), value: stats.totalStartups, icon: Building2, color: "text-blue-600" },
          { label: t("admin.statTotalInvestors"), value: stats.totalInvestors, icon: Users, color: "text-emerald-400" },
          { label: t("admin.statStartupMrr"), value: formatCurrency(stats.startupMrr), icon: DollarSign, color: "text-cr-copper" },
          { label: t("admin.statInvestorMrr"), value: formatCurrency(stats.investorMrr), icon: TrendingUp, color: "text-purple-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-cr-i3">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold text-cr-ink">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="mb-6">
          <TabsTrigger value="pending">
            {t("admin.tabPending")}
            {pendingStartups.length > 0 && (
              <span className="ml-1.5 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">
                {pendingStartups.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="startups">{t("admin.tabAllStartups")}</TabsTrigger>
          <TabsTrigger value="investors">{t("admin.tabInvestors")}</TabsTrigger>
          <TabsTrigger value="deals">{t("admin.tabDeals")}</TabsTrigger>
        </TabsList>

        {/* Pending */}
        <TabsContent value="pending">
          {pendingStartups.length === 0 ? (
            <div className="text-center py-12 text-cr-i4">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>{t("admin.allCaughtUp")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingStartups.map(s => (
                <Card key={s.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-cr-ink">{s.name}</h3>
                          <Badge variant="outline" className="text-xs">{s.stage}</Badge>
                          <Badge variant="outline" className="text-xs">{s.industry}</Badge>
                        </div>
                        <p className="text-sm text-cr-i3">{s.tagline}</p>
                        <p className="text-xs text-cr-i4 mt-1">
                          {t("admin.byLabel")} {s.owner?.full_name || s.owner?.email} · {formatDate(s.created_at)}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 gap-1.5"
                          onClick={() => approveStartup(s.id)}
                          disabled={processingId === s.id}
                        >
                          <CheckCircle2 className="h-4 w-4" /> {t("admin.approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          onClick={() => rejectStartup(s.id)}
                          disabled={processingId === s.id}
                        >
                          <XCircle className="h-4 w-4" /> {t("admin.reject")}
                        </Button>
                      </div>
                    </div>
                    <div className="border-t pt-3">
                      <p className="text-xs text-cr-i3 mb-1">{t("admin.rejectionReasonLabel")}</p>
                      <Textarea
                        className="text-sm h-16"
                        placeholder={t("admin.rejectionPlaceholder")}
                        value={rejectionReason[s.id] || ""}
                        onChange={e => setRejectionReason(prev => ({ ...prev, [s.id]: e.target.value }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* All Startups */}
        <TabsContent value="startups">
          <div className="space-y-2">
            {allStartups.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-cr-paper border rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-cr-ink text-sm">{s.name}</p>
                    <p className="text-xs text-cr-i4">{s.owner?.email} · {s.industry} · {s.stage}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status]}`}>
                    {s.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs bg-cr-p3 text-cr-i3 px-2 py-0.5 rounded-full capitalize">{s.subscription_tier}</span>
                  {s.status === "active" && (
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => suspendStartup(s.id)}>
                      {t("admin.suspend")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Investors */}
        <TabsContent value="investors">
          <div className="space-y-2">
            {allInvestors.map(inv => (
              <div key={inv.id} className="flex items-center justify-between bg-cr-paper border rounded-xl px-4 py-3">
                <div>
                  <p className="font-medium text-cr-ink text-sm">{inv.owner?.email}</p>
                  <p className="text-xs text-cr-i4">{inv.type} · {inv.industries?.join(", ") || t("admin.noPreferences")}</p>
                </div>
                <span className="text-xs bg-cr-copper/15 text-cr-cu-l px-2 py-0.5 rounded-full capitalize">
                  {inv.subscription_tier.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Deals */}
        <TabsContent value="deals">
          <div className="space-y-2">
            {allDeals.map(deal => (
              <div key={deal.id} className="flex items-center justify-between bg-cr-paper border rounded-xl px-4 py-3">
                <div>
                  <p className="font-medium text-cr-ink text-sm">
                    {deal.startup?.name} ↔ {deal.investor?.slug}
                  </p>
                  <p className="text-xs text-cr-i4">
                    {deal.amount ? formatCurrency(deal.amount) : t("admin.amountTBD")} · {formatDate(deal.updated_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={deal.status === "closed" ? "success" : "outline"} className="text-xs">
                    {deal.status}
                  </Badge>
                  {deal.success_fee_invoiced && (
                    <Badge variant="success" className="text-xs">{t("admin.feeInvoiced")}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
