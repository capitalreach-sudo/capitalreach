"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, CreditCard, Sparkles, Check, Receipt } from "lucide-react";
import { useLaunchMode } from "@/hooks/useLaunchMode";
import { getFounderPlan, FOUNDER_PLANS_LIST } from "@/lib/plans";
import { notify } from "@/components/ui/toast-notify";
import { formatMoney } from "@/lib/currency";
import type { Profile } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

export default function StartupBillingPage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const { isLaunch } = useLaunchMode();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!p || p.role !== "startup") { router.push("/dashboard/investor"); return; }
      setProfile(p);
      setLoading(false);
    })();
  }, []);

  async function handlePortal() {
    setPortalLoading(true);
    const res = await fetch("/api/billing-portal", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      notify.error(data.error || t("dashboard.billingPortalError"));
      setPortalLoading(false);
    }
  }

  const [upgrading, setUpgrading] = useState<string | null>(null);
  async function handleUpgrade(planId: string) {
    if (upgrading) return;
    setUpgrading(planId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, userType: "founder" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      notify.error(data.error || t("common.error"));
    } catch {
      notify.error(t("common.error"));
    } finally { setUpgrading(null); }
  }

  if (loading) return <><Navbar /><div className="flex items-center justify-center h-64 text-cr-i4">{t("common.loading")}</div></>;

  const currentPlan = getFounderPlan(profile?.subscription_tier);

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/startup">
            <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Button>
          </Link>
          <h1 className="text-2xl font-bold text-cr-ink">{t("dashboard.billing")}</h1>
        </div>

        {isLaunch && (
          <div className="flex items-center gap-3 bg-cr-copper/10 border border-cr-copper/30 rounded-2xl p-4 mb-6">
            <Sparkles className="h-5 w-5 text-cr-copper flex-shrink-0" />
            <p className="text-sm text-cr-ink">
              {t("dashboard.launchFreeBanner")}
            </p>
          </div>
        )}

        <section className="bg-cr-paper border rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <CreditCard className="h-4 w-4 text-cr-copper" />
            <h2 className="font-semibold text-cr-ink">{t("dashboard.currentPlan")}</h2>
          </div>

          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-lg font-bold text-cr-ink">{currentPlan.name}</p>
              <p className="text-sm text-cr-i3">
                {isLaunch ? t("dashboard.freeDuringLaunch") : currentPlan.price === 0 ? t("common.free") : `$${currentPlan.price}${t("pricing.perMonth")}`}
              </p>
            </div>
            {profile?.stripe_customer_id && (
              <Button onClick={handlePortal} disabled={portalLoading} variant="outline" size="sm">
                {portalLoading ? t("dashboard.opening") : t("dashboard.manageBilling")}
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {Object.entries(currentPlan.features).map(([key, value]) => {
              if (!value) return null;
              return (
                <div key={key} className="flex items-center gap-2 text-sm text-cr-i3">
                  <Check className="h-3.5 w-3.5 text-cr-copper flex-shrink-0" />
                  <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                </div>
              );
            })}
          </div>
        </section>

        <SuccessFees />

        {!isLaunch && currentPlan.id !== "growth" && (
          <section className="bg-cr-paper border rounded-2xl p-6">
            <h2 className="font-semibold text-cr-ink mb-4">{t("dashboard.upgradeYourPlan")}</h2>
            <div className="space-y-3">
              {FOUNDER_PLANS_LIST.filter(p => p.id !== currentPlan.id && p.price > currentPlan.price).map(p => (
                <div key={p.id} className="flex items-center justify-between border rounded-xl p-4">
                  <div>
                    <p className="font-semibold text-cr-ink">{p.name}</p>
                    <p className="text-sm text-cr-i4">${p.price}{t("pricing.perMonth")}</p>
                  </div>
                  <Button onClick={() => handleUpgrade(p.id)} size="sm">{t("common.upgrade")}</Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

type MyFee = {
  id: string; currency: string | null; closedAt: string | null;
  feeMajor: number; state: "collected" | "outstanding" | "unbillable" | "waived" | "disputed";
  investorName: string | null; disputeReason: string | null;
  disputeResolution: string | null; resolvedAt: string | null;
};

/**
 * E47: what the 2% actually is, on the page the fee notification links to.
 *
 * A founder used to receive an invoice for 2% of their round with nothing on
 * the platform explaining what it was for or what to do if the amount looked
 * wrong — the only way to disagree was to ignore the reminders, which the
 * platform then read as non-payment. Disputing here pauses the chasing and
 * puts a human on it.
 */
function SuccessFees() {
  const { t } = useTranslation();
  const [fees, setFees] = useState<MyFee[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    const res = await fetch("/api/fees/mine");
    setFees(res.ok ? (await res.json()).fees ?? [] : []);
  }
  useEffect(() => { void load(); }, []);

  async function dispute(id: string) {
    if (!reason.trim()) { notify.error(t("myFees.disputeNeedsReason")); return; }
    setBusy(id);
    const res = await fetch("/api/fees/mine", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId: id, reason }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { notify.error(j.error || t("common.error")); return; }
    setOpenId(null); setReason("");
    notify.success(t("myFees.disputeOpened"));
    void load();
  }

  if (!fees || fees.length === 0) return null;

  const tone: Record<MyFee["state"], string> = {
    collected: "text-emerald-700", outstanding: "text-amber-700",
    unbillable: "text-cr-i3", waived: "text-cr-i4", disputed: "text-cr-copper",
  };

  return (
    <section className="bg-cr-paper border rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Receipt className="h-4 w-4 text-cr-copper" />
        <h2 className="font-semibold text-cr-ink">{t("myFees.title")}</h2>
      </div>
      <p className="text-sm text-cr-i4 mb-5">{t("myFees.intro")}</p>

      <div className="space-y-3">
        {fees.map(f => (
          <div key={f.id} className="border rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-cr-ink">{formatMoney(f.feeMajor, f.currency)}</p>
                <p className="text-xs text-cr-i4 mt-0.5">
                  {f.investorName ?? t("myFees.anInvestor")}
                  {f.closedAt && ` · ${t("fees.closed")} ${new Date(f.closedAt).toLocaleDateString()}`}
                </p>
              </div>
              <span className={`text-xs font-semibold ${tone[f.state]}`}>{t(`myFees.state.${f.state}`)}</span>
            </div>

            {f.state === "disputed" && (
              <p className="text-xs text-cr-i3 mt-2">{t("myFees.underReview")}{f.disputeReason ? ` — “${f.disputeReason}”` : ""}</p>
            )}
            {f.resolvedAt && f.disputeResolution && (
              <p className="text-xs text-cr-i3 mt-2">{t("myFees.resolved")}: {f.disputeResolution}</p>
            )}

            {/* 087: the objection to the fee is usually timing, not amount. */}
            <FeePlan dealId={f.id} state={f.state} onChanged={load} />

            {(f.state === "outstanding" || f.state === "unbillable") && (
              openId === f.id ? (
                <div className="mt-3">
                  <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 1000))}
                    rows={3} placeholder={t("myFees.disputePlaceholder")}
                    className="w-full text-sm border rounded-lg p-2 bg-cr-paper-2 text-cr-ink" />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => dispute(f.id)} disabled={busy === f.id}>{t("myFees.submitDispute")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setOpenId(null); setReason(""); }}>{t("common.cancel")}</Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setOpenId(f.id)} className="text-xs font-semibold text-cr-copper mt-2">
                  {t("myFees.disputeCta")}
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

type Instalment = { seq: number; amount: number; due_date: string; paid_at: string | null; billing_error?: string | null };

/**
 * The instalment schedule for one fee, and the offer to start one.
 *
 * Shown on the fee itself rather than in a settings page: the moment a founder
 * is looking at a number they were not expecting is the moment the alternative
 * is worth knowing about.
 */
function FeePlan({ dealId, state, onChanged }: { dealId: string; state: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ instalments: Instalment[]; eligible: boolean; minMonths: number; maxMonths: number } | null>(null);
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/fees/plan?dealId=${dealId}`);
    if (res.ok) setData(await res.json());
  }, [dealId]);
  useEffect(() => { void load(); }, [load]);

  async function start() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/fees/plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, months }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(j.error || t("common.error")); return; }
    notify.success(t("feePlan.started"));
    void load();
    onChanged();
  }

  if (!data) return null;

  if (data.instalments.length > 0) {
    const paid = data.instalments.filter(i => i.paid_at).length;
    return (
      <div className="mt-3 border-t pt-3">
        <p className="text-xs font-semibold text-cr-ink mb-2">
          {t("feePlan.scheduleTitle", { paid, count: data.instalments.length })}
        </p>
        <ul className="space-y-1">
          {data.instalments.map(i => (
            <li key={i.seq} className="flex items-center justify-between text-xs">
              <span className={i.paid_at ? "text-cr-i4 line-through" : "text-cr-i3"}>
                {t("feePlan.instalmentN", { n: i.seq })} · {new Date(i.due_date).toLocaleDateString()}
              </span>
              <span className={`font-mono ${i.paid_at ? "text-emerald-700" : "text-cr-ink"}`}>
                {(i.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                {i.paid_at ? ` ${t("feePlan.paidMark")}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!data.eligible || state === "collected") return null;

  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-xs text-cr-i4 mb-2">{t("feePlan.offer")}</p>
      <div className="flex items-center gap-2">
        <select value={months} onChange={e => setMonths(Number(e.target.value))}
          className="text-xs border rounded-lg px-2 py-1 bg-cr-paper text-cr-ink">
          {Array.from({ length: data.maxMonths - data.minMonths + 1 }, (_, i) => data.minMonths + i).map(m => (
            <option key={m} value={m}>{t("feePlan.months", { n: m })}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={start} disabled={busy}>{t("feePlan.start")}</Button>
      </div>
      <p className="text-[11px] text-cr-i4 mt-2">{t("feePlan.sameTotal")}</p>
    </div>
  );
}
