"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, CreditCard, Sparkles, Check } from "lucide-react";
import { useLaunchMode } from "@/hooks/useLaunchMode";
import { getFounderPlan, FOUNDER_PLANS_LIST } from "@/lib/plans";
import { notify } from "@/components/ui/toast-notify";
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

  async function handleUpgrade(planId: string) {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, userType: "founder" }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else notify.error(data.error || t("common.error"));
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
