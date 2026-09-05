"use client";

import Link from "next/link";
import { LedgerLoader } from "@/components/ui/LedgerLoader";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { notify } from "@/components/ui/toast-notify";
import { CheckCircle2, XCircle, AlertCircle, DollarSign, Users, Building2, TrendingUp } from "lucide-react";
import { formatCurrency, formatDate, STATUS_COLORS } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { RevenueSummary } from "@/lib/revenue";
import { LineChart } from "@/components/charts/line-chart";
import type { Startup, Investor, Deal } from "@/types";

interface Props {
  pendingStartups: (Startup & { owner: { email: string; full_name: string } })[];
  allStartups: (Startup & { owner: { email: string; full_name: string } })[];
  allInvestors: (Investor & { owner: { email: string; full_name: string; subscription_tier: string } })[];
  allDeals: (Deal & { startup: { name: string }; investor: { slug: string } })[];
  stats: { totalStartups: number; totalInvestors: number; startupMrr: number; investorMrr: number };
  /** E45: real revenue, computed over every account and every deal. */
  revenue?: RevenueSummary;
  /** Twelve months of fee flow, oldest first. */
  feeMonths?: Array<{ month: string; billed: number; collected: number }>;
}

export function AdminClient({ pendingStartups, allStartups, allInvestors, allDeals, stats, revenue, feeMonths = [] }: Props) {
  // Launch mode: the everyone-gets-top-tier state. null until loaded.
  const [launch, setLaunch] = useState<{ isLaunch: boolean; memberCount: number; target: number } | null>(null);
  const [savingLaunch, setSavingLaunch] = useState(false);
  useEffect(() => {
    fetch("/api/admin/launch-mode").then(r => r.ok ? r.json() : null).then(setLaunch).catch(() => {});
  }, []);
  async function setLaunchMode(enabled: boolean) {
    setSavingLaunch(true);
    const res = await fetch("/api/admin/launch-mode", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setSavingLaunch(false);
    if (res.ok) setLaunch(await res.json());
    else toast({ title: t("errors.generic"), variant: "destructive" });
  }
  const { t } = useTranslation();
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toast } = useToast();

  async function toggleVerified(investorId: string, verified: boolean) {
    const res = await fetch("/api/admin/investor/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investorId, verified }),
    });
    if (res.ok) toast({ title: verified ? t("adminVerify.done") : t("adminVerify.undone") });
    else { toast({ title: t("adminVerify.failed"), variant: "destructive" }); return; }
    window.location.reload();
  }

  async function toggleStartupVerified(startupId: string, verified: boolean) {
    const res = await fetch("/api/admin/startup/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId, verified }),
    });
    if (res.ok) toast({ title: verified ? t("adminVerify.done") : t("adminVerify.undone") });
    else { toast({ title: t("adminVerify.failed"), variant: "destructive" }); return; }
    window.location.reload();
  }

  async function approveStartup(id: string) {
    setProcessingId(id);
    const res = await fetch("/api/admin/startup/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: id }),
    });
    setProcessingId(null);
    if (res.ok) { toast({ title: t("admin.toastApproved") }); window.location.reload(); }
    else toast({ title: t("admin.toastApproveFailed"), variant: "destructive" });
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
    setProcessingId(null);
    if (res.ok) { toast({ title: t("admin.toastRejected") }); window.location.reload(); }
    else toast({ title: t("admin.toastRejectFailed"), variant: "destructive" });
  }

  async function suspendStartup(id: string) {
    const res = await fetch("/api/admin/startup/suspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: id }),
    });
    if (res.ok) window.location.reload();
    else toast({ title: t("errors.generic"), variant: "destructive" });
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-cr-copper rounded-xl flex items-center justify-center">
          <AlertCircle className="h-5 w-5 text-cr-paper" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-cr-ink">{t("admin.panelTitle")}</h1>
          <p className="text-cr-i3 text-sm">{t("admin.panelSub")}</p>
        </div>
      </div>

      {launch !== null && (
        <div className="bg-cr-paper border rounded-2xl p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-cr-ink">{t("admin.launchTitle")}</p>
            <p className="text-xs text-cr-i3 mt-0.5">
              {launch.isLaunch
                ? t("admin.launchOnSub", { memberCount: launch.memberCount, target: launch.target })
                : t("admin.launchOffSub")}
            </p>
          </div>
          <button
            onClick={() => setLaunchMode(!launch.isLaunch)}
            disabled={savingLaunch}
            className={`text-xs font-medium px-4 py-2 rounded-lg border transition-colors ${
              launch.isLaunch
                ? "border-cr-copper text-cr-copper hover:bg-cr-copper/10"
                : "bg-cr-copper text-cr-paper border-cr-copper"
            }`}
          >
            {savingLaunch ? t("common.loading") : launch.isLaunch ? t("admin.launchTurnOff") : t("admin.launchTurnOn")}
          </button>
        </div>
      )}

      {/* E45: the business model, on the operator's own page at last. */}
      {revenue && (
        <Card className="mb-8">
          <CardContent className="p-5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
              <h2 className="ruled-label">{t("revenue.title")}</h2>
              <span className="text-[11px] text-cr-i4">
                {t("revenue.payingAccounts", { count: revenue.payingAccounts })}
                {revenue.feeCurrencies.length > 1 && ` · ${t("revenue.mixedCurrencies", { list: revenue.feeCurrencies.join(", ") })}`}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { k: "revenue.feesBilled", v: revenue.feesBilled, cls: "text-cr-ink" },
                { k: "revenue.feesCollected", v: revenue.feesCollected, cls: "text-cr-up" },
                { k: "revenue.feesOutstanding", v: revenue.feesOutstanding, cls: revenue.feesOutstanding > 0 ? "text-cr-copper" : "text-cr-i3" },
                { k: "revenue.feesUnbillable", v: revenue.feesUnbillable, cls: revenue.feesUnbillable > 0 ? "text-cr-down" : "text-cr-i3" },
                { k: "revenue.feesReversed", v: revenue.feesReversed, cls: revenue.feesReversed > 0 ? "text-cr-down" : "text-cr-i3" },
              ].map(({ k, v, cls }) => (
                <div key={k}>
                  <p className={`font-mono text-xl font-bold ${cls}`}>{formatCurrency(v)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-cr-i4 mt-1">{t(k)}</p>
                </div>
              ))}
            </div>
            {revenue.feesUnbillable > 0 && (
              <p className="text-[11px] text-cr-down mt-3">{t("revenue.unbillableNote")}</p>
            )}
            {revenue.byTier.length > 0 && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 pt-3 border-t border-cr-p4">
                {revenue.byTier.map((row) => (
                  <span key={row.tier} className="text-[11px] text-cr-i3">
                    <span className="font-semibold text-cr-ink capitalize">{row.tier.replace(/_/g, " ")}</span>
                    {" "}<span className="font-mono">×{row.count}</span> · <span className="font-mono">{formatCurrency(row.mrr)}</span>/mo
                  </span>
                ))}
              </div>
            )}

            {/* Fee flow over time, same chart kit as the public data centre.
                Billed and collected on ONE frame because they share a unit and
                a scale -- the gap between the lines IS the outstanding money.
                MRR gets no line: tier changes are not logged, so an MRR
                history would be a reconstruction, and charting a guess on the
                page an operator bills from is how guesses become facts. */}
            {feeMonths.length > 0 && feeMonths.some(m => m.billed > 0 || m.collected > 0) && (
              <div className="mt-5 pt-4 border-t border-cr-p4">
                <p className="text-[10px] uppercase tracking-wider text-cr-i4 mb-2">{t("revenue.feeFlow")}</p>
                <LineChart
                  height={150}
                  labels={feeMonths.map(m => m.month.slice(5))}
                  formatTick={(n) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`)}
                  series={[
                    { key: "billed", label: t("revenue.feesBilled"), values: feeMonths.map(m => m.billed), format: (n) => formatCurrency(n) },
                    { key: "collected", label: t("revenue.feesCollected"), values: feeMonths.map(m => m.collected), format: (n) => formatCurrency(n) },
                  ]}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: t("admin.statTotalStartups"), value: stats.totalStartups, icon: Building2, color: "text-cr-i3" },
          { label: t("admin.statTotalInvestors"), value: stats.totalInvestors, icon: Users, color: "text-cr-i3" },
          { label: t("revenue.subscriptionMrr"), value: formatCurrency(revenue?.subscriptionMrr ?? stats.startupMrr), icon: DollarSign, color: "text-cr-copper" },
          { label: t("revenue.feesCollected"), value: formatCurrency(revenue?.feesCollected ?? 0), icon: TrendingUp, color: "text-cr-up" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-cr-i3">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="font-mono text-2xl font-bold text-cr-ink">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="mb-6">
          <TabsTrigger value="pending">
            {t("admin.tabPending")}
            {pendingStartups.length > 0 && (
              <span className="ml-1.5 bg-cr-copper/15 text-cr-copper font-mono text-xs px-1.5 py-0.5 rounded-full">
                {pendingStartups.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="startups">{t("admin.tabAllStartups")}</TabsTrigger>
          <TabsTrigger value="investors">{t("admin.tabInvestors")}</TabsTrigger>
          <TabsTrigger value="deals">{t("admin.tabDeals")}</TabsTrigger>
          <TabsTrigger value="fees">{t("fees.tab")}</TabsTrigger>
          <TabsTrigger value="reports">{t("report.tab")}</TabsTrigger>
          <TabsTrigger value="complaints">{t("complaints.tab")}</TabsTrigger>
        </TabsList>

        {/* Pending */}
        <TabsContent value="pending">
          {pendingStartups.length === 0 ? (
            <div className="text-center py-12 text-cr-i4">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-cr-copper" />
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
                          {t("admin.byLabel")} {s.owner?.full_name || s.owner?.email} · <span className="font-mono">{formatDate(s.created_at)}</span>
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          className="bg-cr-copper hover:bg-cr-cu-d text-cr-paper gap-1.5"
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
          <AdminList entity="startups" initial={allStartups as unknown as Record<string, unknown>[]}
            statuses={["active", "pending_review", "draft", "suspended", "rejected"]}>
            {(rows) => (
          <div className="space-y-2">
            {(rows as unknown as typeof allStartups).map(s => (
              <div key={s.id} className="flex items-center justify-between bg-cr-paper border rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-cr-ink text-sm">{s.name}</p>
                    <p className="text-xs text-cr-i4">
                      {s.owner?.email} · {s.industry} · {s.stage}
                      {" · "}
                      {/* The founder dashboard as its founder sees it -- every
                          feature they have, read-only, visit audited. */}
                      <Link href={`/admin/view/startup/${s.id}`} className="text-cr-copper underline underline-offset-2">
                        {t("admin.viewDashboard")}
                      </Link>
                      {" · "}
                      <Link href={`/startups/${s.slug}`} className="text-cr-copper underline underline-offset-2">
                        {t("admin.viewListing")}
                      </Link>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status]}`}>
                    {s.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs bg-cr-p3 text-cr-i3 px-2 py-0.5 rounded-full capitalize">{s.subscription_tier}</span>
                  {/* Live listing edited by the founder since approval: stays live,
                      flagged here for a re-check. Clicking clears the flag. */}
                  {s.status === "active" && s.edited_since_review_at && (
                    <Button size="sm" variant="outline" className="text-xs h-7 text-cr-copper border-cr-copper/50"
                      title={new Date(s.edited_since_review_at).toLocaleString()}
                      onClick={async () => {
                        const res = await fetch("/api/admin/startup/ack-edits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startupId: s.id }) });
                        if (res.ok) { toast({ title: t("admin.editsAcked") }); window.location.reload(); } else toast({ title: t("errors.generic"), variant: "destructive" });
                      }}>
                      {t("admin.editedSinceReview")}
                    </Button>
                  )}
                  {s.status === "active" && (
                    <Button size="sm" variant="outline"
                      className={s.verified_at ? "text-xs h-7 text-cr-up border-cr-up/40" : "text-xs h-7"}
                      onClick={() => toggleStartupVerified(s.id, !s.verified_at)}>
                      {s.verified_at ? t("adminVerify.unverify") : t("adminVerify.verify")}
                    </Button>
                  )}
                  {s.status === "active" && (
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => suspendStartup(s.id)}>
                      {t("admin.suspend")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
            )}
          </AdminList>
        </TabsContent>

        {/* Investors */}
        <TabsContent value="investors">
          <AdminList entity="investors" initial={allInvestors as unknown as Record<string, unknown>[]}
            statuses={["public", "external"]}>
            {(rows) => (
          <div className="space-y-2">
            {(rows as unknown as typeof allInvestors).map(inv => (
              <div key={inv.id} className="flex items-center justify-between bg-cr-paper border rounded-xl px-4 py-3">
                <div>
                  <p className="font-medium text-cr-ink text-sm">{inv.owner?.email}</p>
                  <p className="text-xs text-cr-i4">{inv.type} · {inv.industries?.join(", ") || t("admin.noPreferences")}</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Verification is a judgement, so it is a click away from
                      the row where the judgement gets made. */}
                  <button
                    onClick={() => toggleVerified(inv.id, !inv.verified_at)}
                    className={inv.verified_at
                      ? "text-xs text-cr-i4 underline underline-offset-2"
                      : "text-xs text-cr-copper underline underline-offset-2"}
                  >
                    {inv.verified_at ? t("adminVerify.unverify") : t("adminVerify.verify")}
                  </button>
                  {/* The only route to an investor dashboard for an admin --
                      their own dashboard path is /admin. */}
                  <Link href={`/admin/view/investor/${inv.id}`} className="text-xs text-cr-copper underline underline-offset-2">
                    {t("viewAs.open")}
                  </Link>
                  <span className="text-xs bg-cr-copper/15 text-cr-cu-l px-2 py-0.5 rounded-full capitalize">
                    {inv.subscription_tier.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
            )}
          </AdminList>
        </TabsContent>

        {/* Deals */}
        <TabsContent value="deals">
          <AdminList entity="deals" initial={allDeals as unknown as Record<string, unknown>[]}
            statuses={["intro", "due_diligence", "term_sheet", "closed", "passed"]}>
            {(rows) => (
          <div className="space-y-2">
            {(rows as unknown as typeof allDeals).map(deal => (
              <div key={deal.id} className="flex items-center justify-between bg-cr-paper border rounded-xl px-4 py-3">
                <div>
                  <p className="font-medium text-cr-ink text-sm">
                    {deal.startup?.name} ↔ {deal.investor?.slug}
                  </p>
                  <p className="text-xs text-cr-i4">
                    {deal.amount ? <span className="font-mono">{formatCurrency(deal.amount)}</span> : t("admin.amountTBD")} · <span className="font-mono">{formatDate(deal.updated_at)}</span>
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
            )}
          </AdminList>
        </TabsContent>

        {/* E46: the fee ledger. */}
        <TabsContent value="fees">
          <FeeLedger />
        </TabsContent>

        {/* E50: the report queue. */}
        <TabsContent value="reports">
          <ReportQueue />
        </TabsContent>

        {/* Complaints: "something went wrong for me" -- distinct lifecycle
            from content reports, same operator discipline: every complaint
            leaves with a recorded outcome and the filer is told. */}
        <TabsContent value="complaints">
          <ComplaintQueue />
        </TabsContent>
      </Tabs>
    </main>
  );
}

type ReportRow = {
  id: string; target_type: string; target_id: string; reason: string;
  detail: string | null; status: string; created_at: string;
  targetName: string | null; targetHref: string | null; targetStatus: string | null;
  resolution: string | null;
};

/**
 * E50, operator side.
 *
 * Two outcomes, both recorded: "actioned" means something was done about the
 * content, "dismissed" means it was looked at and was fine. Nothing is
 * deleted from here -- suspending a listing still goes through the route that
 * audits it. The reporter is told either way, because a report that vanishes
 * teaches people not to file the next one.
 */
function ReportQueue() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (st: string) => {
    const res = await fetch(`/api/admin/reports?status=${st}`);
    setReports(res.ok ? (await res.json()).reports ?? [] : []);
  }, []);
  useEffect(() => { void load(status); }, [load, status]);

  async function resolve(r: ReportRow, next: "actioned" | "dismissed") {
    const resolution = window.prompt(t("report.resolvePrompt")) ?? "";
    setBusy(r.id);
    const res = await fetch("/api/admin/reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: r.id, status: next, resolution }),
    });
    setBusy(null);
    if (!res.ok) { notify.error((await res.json().catch(() => ({}))).error || t("errors.generic")); return; }
    notify.success(t("report.resolved"));
    void load(status);
  }

  if (reports === null) return <div className="py-8 text-center"><LedgerLoader /></div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        {["open", "actioned", "dismissed", "all"].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`text-xs font-semibold ${status === s ? "text-cr-ink" : "text-cr-i4"}`}>
            {t(`report.filter.${s}`)}
          </button>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-12 text-cr-i4">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-cr-copper" />
          <p>{t("report.queueEmpty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(r => (
            <div key={r.id} className="bg-cr-paper border rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-cr-ink text-sm">
                    {r.targetHref ? (
                      <Link href={r.targetHref} className="underline underline-offset-2">{r.targetName ?? r.target_type}</Link>
                    ) : (r.targetName ?? r.target_type)}
                    <span className="text-cr-i4 font-normal"> · {t(`report.reason.${r.reason}`)}</span>
                  </p>
                  <p className="text-xs text-cr-i4"><span className="font-mono">{formatDate(r.created_at)}</span>{r.targetStatus && ` · ${r.targetStatus.replace(/_/g, " ")}`}</p>
                </div>
                {r.status === "open" ? (
                  <div className="flex items-center gap-3">
                    <button onClick={() => resolve(r, "actioned")} disabled={busy === r.id}
                      className="text-xs font-semibold text-cr-copper disabled:opacity-50">{t("report.action")}</button>
                    <button onClick={() => resolve(r, "dismissed")} disabled={busy === r.id}
                      className="text-xs font-semibold text-cr-i4 disabled:opacity-50">{t("report.dismiss")}</button>
                  </div>
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-cr-i4">{t(`report.filter.${r.status}`)}</span>
                )}
              </div>
              {r.detail && <p className="text-[12px] text-cr-i3 mt-1.5 break-words">“{r.detail}”</p>}
              {r.resolution && <p className="text-[11px] text-cr-i4 mt-1.5">{t("report.resolutionLabel")}: {r.resolution}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ComplaintRow = {
  id: string; category: string; subject: string; body: string; status: string;
  resolution_note: string | null; created_at: string;
  filerName: string; filerRole: string | null;
};

function ComplaintQueue() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ComplaintRow[] | null>(null);
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (st: string) => {
    const res = await fetch(`/api/admin/complaints?status=${st}`);
    setRows(res.ok ? (await res.json()).complaints ?? [] : []);
  }, []);
  useEffect(() => { void load(status); }, [load, status]);

  async function move(r: ComplaintRow, next: "in_review" | "resolved" | "dismissed") {
    // Terminal states demand a note the filer will read; taking a complaint
    // into review does not.
    let note = "";
    if (next !== "in_review") {
      note = window.prompt(t("complaints.resolvePrompt")) ?? "";
      if (!note.trim()) return;
    }
    setBusy(r.id);
    const res = await fetch("/api/admin/complaints", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, status: next, resolutionNote: note || undefined }),
    });
    setBusy(null);
    if (!res.ok) { notify.error((await res.json().catch(() => ({}))).error || t("errors.generic")); return; }
    notify.success(t("complaints.moved"));
    void load(status);
  }

  if (rows === null) return <div className="py-8 text-center"><LedgerLoader /></div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {["open", "in_review", "resolved", "dismissed", "all"].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`text-xs font-semibold ${status === s ? "text-cr-ink" : "text-cr-i4"}`}>
            {t(`complaints.status.${s === "all" ? "all" : s}`)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 text-cr-i4">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-cr-copper" />
          <p>{t("complaints.queueEmpty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="bg-cr-paper border rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-cr-ink text-sm">
                    {r.subject}
                    <span className="text-cr-i4 font-normal"> · {t(`complaints.cat.${r.category}`)}</span>
                  </p>
                  <p className="text-xs text-cr-i4">
                    {r.filerName}{r.filerRole ? ` (${r.filerRole})` : ""} · <span className="font-mono">{formatDate(r.created_at)}</span>
                  </p>
                </div>
                {(r.status === "open" || r.status === "in_review") ? (
                  <div className="flex items-center gap-3">
                    {r.status === "open" && (
                      <button onClick={() => move(r, "in_review")} disabled={busy === r.id}
                        className="text-xs font-semibold text-cr-i2 disabled:opacity-50">{t("complaints.review")}</button>
                    )}
                    <button onClick={() => move(r, "resolved")} disabled={busy === r.id}
                      className="text-xs font-semibold text-cr-copper disabled:opacity-50">{t("complaints.resolve")}</button>
                    <button onClick={() => move(r, "dismissed")} disabled={busy === r.id}
                      className="text-xs font-semibold text-cr-i4 disabled:opacity-50">{t("complaints.dismissAct")}</button>
                  </div>
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-cr-i4">{t(`complaints.status.${r.status}`)}</span>
                )}
              </div>
              <p className="text-[12px] text-cr-i3 mt-1.5 break-words whitespace-pre-wrap">{r.body}</p>
              {r.resolution_note && <p className="text-[11px] text-cr-i4 mt-1.5">{t("complaints.resolution")}: {r.resolution_note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * E54: search, paging and CSV over an admin table.
 *
 * These tabs used to render a hardcoded first fifty rows with nothing saying
 * so -- at 100+ accounts the operator was looking at an arbitrary slice of the
 * platform and could not tell. The server render is still the first page, so
 * the tab paints instantly; anything else comes from /api/admin/list.
 */
function AdminList({ entity, initial, statuses, children }: {
  entity: "startups" | "investors" | "deals";
  initial: Record<string, unknown>[];
  statuses: string[];
  children: (rows: Record<string, unknown>[]) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(initial);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 25;

  const load = useCallback(async (p: number, query: string, st: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/list?entity=${entity}&page=${p}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(query)}&status=${encodeURIComponent(st)}`);
    setLoading(false);
    if (!res.ok) return;
    const j = await res.json();
    setRows(j.rows ?? []); setTotal(j.total ?? 0);
  }, [entity]);

  // First load replaces the server's page with a counted one, so the row count
  // on screen is the real total rather than "however many fitted".
  useEffect(() => { void load(1, "", ""); }, [load]);

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => { setPage(1); void load(1, q, status); }, 300);
    return () => clearTimeout(id);
  }, [q, status, load]);

  const pages = total == null ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("adminList.searchPh")}
          className="text-sm border rounded-lg px-3 py-1.5 bg-cr-paper text-cr-ink min-w-[180px]" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1.5 bg-cr-paper text-cr-ink">
          <option value="">{t("dashboard.filterAll")}</option>
          {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <span className="font-mono text-xs text-cr-i4">
          {loading ? t("common.loading")
            : total == null ? ""
            : t("adminList.showing", { shown: rows.length, total })}
        </span>
        <a href={`/api/admin/list?entity=${entity}&format=csv&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`}
          className="text-xs font-semibold text-cr-copper ml-auto">{t("dashboard.exportCsv")}</a>
      </div>

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-cr-i4 text-center py-10">{t("adminList.noMatches")}</p>
      ) : children(rows)}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); void load(p, q, status); }}
            className="text-xs font-semibold text-cr-copper disabled:opacity-40">{t("common.back")}</button>
          <span className="font-mono text-xs text-cr-i4">{t("adminList.page", { page, pages })}</span>
          <button disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); void load(p, q, status); }}
            className="text-xs font-semibold text-cr-copper disabled:opacity-40">{t("adminList.next")}</button>
        </div>
      )}
    </div>
  );
}

type LedgerRow = {
  id: string; currency: string | null; closed_at: string | null;
  state: "collected" | "outstanding" | "unbillable" | "waived" | "disputed" | "reversed";
  feeMajor: number; startupName: string | null; startupSlug: string | null;
  fee_billing_status: string | null; fee_billing_error: string | null;
  fee_reminder_count: number | null; fee_waive_reason: string | null;
  fee_dispute_reason: string | null;
};

const STATE_STYLE: Record<LedgerRow["state"], string> = {
  collected:   "bg-[var(--cr-up-bg)] text-cr-up border-cr-up/30",
  outstanding: "bg-[var(--cr-copper-bg)] text-cr-copper border-cr-copper/30",
  unbillable:  "bg-[var(--cr-down-bg)] text-cr-down border-cr-p4",
  waived:      "bg-cr-p3 text-cr-i3 border-cr-p4",
  disputed:    "bg-cr-copper/15 text-cr-copper border-cr-copper/40",
  reversed:    "bg-[var(--cr-down-bg)] text-cr-down border-[color:var(--cr-down)]",
};

/**
 * E46: every fee the platform is owed, in one list, with the three things an
 * operator can actually do about one. Before this, a fee that failed to bill
 * was visible only by opening the deal it belonged to -- which is to say, it
 * was not visible.
 */
function FeeLedger() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [totals, setTotals] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/fees");
    if (!res.ok) { setRows([]); return; }
    const j = await res.json();
    setRows(j.rows ?? []); setTotals(j.totals ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(row: LedgerRow, action: "retry" | "waive" | "markPaid" | "resolveDispute") {
    let reason: string | null = null;
    if (action === "waive" || action === "resolveDispute") {
      reason = window.prompt(action === "waive" ? t("fees.waivePrompt") : t("fees.resolvePrompt"));
      if (!reason?.trim()) return;
    }
    if (action === "markPaid") {
      reason = window.prompt(t("fees.markPaidPrompt")) ?? "";
    }
    setBusy(row.id);
    const res = await fetch("/api/admin/fees", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId: row.id, action, reason }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    notify.success(t("fees.done"));
    void load();
  }

  if (rows === null) return <div className="py-8 text-center"><LedgerLoader /></div>;
  // A dispute is open business too -- it is the one state that needs a person.
  const shown = filter === "open" ? rows.filter(r => r.state === "outstanding" || r.state === "unbillable" || r.state === "disputed" || r.state === "reversed") : rows;

  return (
    <div>
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {(["outstanding", "unbillable", "disputed", "reversed"] as const).map(k => (
            <div key={k} className="border border-cr-p4 rounded-xl px-4 py-3">
              <p className="font-mono text-lg font-bold text-cr-ink">{formatCurrency(totals[k] ?? 0)}</p>
              <p className="text-[10px] uppercase tracking-wider text-cr-i4 mt-0.5">{t(`revenue.fees${k.charAt(0).toUpperCase()}${k.slice(1)}`)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setFilter(filter === "open" ? "all" : "open")}
          className="text-xs font-semibold text-cr-copper">
          {filter === "open" ? t("fees.showAll") : t("fees.showOpen")}
        </button>
        <span className="font-mono text-xs text-cr-i4">{t("fees.count", { count: shown.length })}</span>
      </div>
      {shown.length === 0 ? (
        <div className="text-center py-12 text-cr-i4">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-cr-copper" />
          <p>{t("fees.allSettled")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(row => (
            <div key={row.id} className="bg-cr-paper border rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-cr-ink text-sm truncate">{row.startupName ?? t("admin.amountTBD")}</p>
                  <p className="text-xs text-cr-i4">
                    <span className="font-mono">{formatCurrency(row.feeMajor)}</span>
                    {row.closed_at && <>{" · "}{t("fees.closed")} <span className="font-mono">{formatDate(row.closed_at)}</span></>}
                    {(row.fee_reminder_count ?? 0) > 0 && ` · ${t("fees.chased", { count: row.fee_reminder_count ?? 0 })}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border ${STATE_STYLE[row.state]}`}>
                    {t(`fees.state.${row.state}`)}
                  </span>
                  {row.state === "disputed" && (
                    <button onClick={() => act(row, "resolveDispute")} disabled={busy === row.id}
                      className="text-xs font-semibold text-cr-copper disabled:opacity-50">{t("fees.resolve")}</button>
                  )}
                  {row.state === "unbillable" && (
                    <button onClick={() => act(row, "retry")} disabled={busy === row.id}
                      className="text-xs font-semibold text-cr-copper disabled:opacity-50">{t("fees.retry")}</button>
                  )}
                  {(row.state === "unbillable" || row.state === "outstanding") && (
                    <>
                      <button onClick={() => act(row, "markPaid")} disabled={busy === row.id}
                        className="text-xs font-semibold text-cr-up disabled:opacity-50">{t("fees.markPaid")}</button>
                      <button onClick={() => act(row, "waive")} disabled={busy === row.id}
                        className="text-xs font-semibold text-cr-i4 disabled:opacity-50">{t("fees.waive")}</button>
                    </>
                  )}
                </div>
              </div>
              {row.fee_billing_error && (
                <p className="text-[11px] text-cr-down mt-1.5 break-words">{row.fee_billing_error}</p>
              )}
              {row.state === "disputed" && row.fee_dispute_reason && (
                <p className="text-[11px] text-cr-copper mt-1.5 break-words">“{row.fee_dispute_reason}”</p>
              )}
              {row.state === "waived" && row.fee_waive_reason && (
                <p className="text-[11px] text-cr-i4 mt-1.5">{t("fees.waivedFor")}: {row.fee_waive_reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
