"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { LedgerLoader } from "@/components/ui/LedgerLoader";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft } from "lucide-react";
import { useLaunchMode } from "@/hooks/useLaunchMode";
import { getFounderPlan, FOUNDER_PLANS_LIST } from "@/lib/plans";
import { notify } from "@/components/ui/toast-notify";
import { formatMoney } from "@/lib/currency";
import type { Profile } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

// ── House register: shared presentation constants ─────────────

const MONO: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontVariantNumeric: "tabular-nums",
};

const BODY: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 300,
};

const LABEL: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 500,
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
};

const CARD: React.CSSProperties = {
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};

const BTN_OUTLINE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  padding: "0 16px",
  borderRadius: "999px",
  background: "transparent",
  border: "1px solid var(--cr-paper-4)",
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 500,
  fontSize: "13px",
  color: "var(--cr-ink)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const BTN_TEXT: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "40px",
  padding: 0,
  background: "none",
  border: "none",
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 600,
  fontSize: "12px",
  cursor: "pointer",
};

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

  if (loading) return (
    <>
      <Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <LedgerLoader />
      </div>
    </>
  );

  const currentPlan = getFounderPlan(profile?.subscription_tier);

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "100vh", paddingBottom: "64px" }}>
        <div style={{ maxWidth: "672px", margin: "0 auto", padding: "40px 24px" }}>

          {/* Back + Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
            <Link href="/dashboard/startup" style={{ display: "flex", alignItems: "center", gap: "4px", ...BODY, fontSize: "13px", color: "var(--cr-ink-4)", textDecoration: "none" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-4)")}>
              <ArrowLeft style={{ width: 14, height: 14 }} /> {t("common.back")}
            </Link>
            <div style={{ width: 1, height: 14, background: "var(--cr-rule-dark)" }} aria-hidden />
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "24px", color: "var(--cr-ink)", letterSpacing: "-0.02em" }}>
              {t("dashboard.billing")}
            </h1>
          </div>

          {isLaunch && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "12px 16px", marginBottom: "24px" }}>
              <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "13px", flexShrink: 0, lineHeight: 1 }}>✦</span>
              <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink)", lineHeight: 1.5, margin: 0 }}>
                {t("dashboard.launchFreeBanner")}
              </p>
            </div>
          )}

          <section style={{ marginBottom: "32px" }}>
            <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("dashboard.currentPlan")}</div>
            <div style={{ ...CARD, padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", paddingBottom: "16px" }}>
                <div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)", margin: 0 }}>{currentPlan.name}</p>
                  <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-3)", marginTop: "4px" }}>
                    {isLaunch
                      ? t("dashboard.freeDuringLaunch")
                      : currentPlan.price === 0
                        ? t("common.free")
                        : (<><span style={{ ...MONO, fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>${currentPlan.price}</span>{t("pricing.perMonth")}</>)}
                  </p>
                </div>
                {profile?.stripe_customer_id && (
                  <button onClick={handlePortal} disabled={portalLoading} style={{ ...BTN_OUTLINE, opacity: portalLoading ? 0.6 : 1 }}>
                    {portalLoading ? t("dashboard.opening") : t("dashboard.manageBilling")}
                  </button>
                )}
              </div>

              <div>
                {Object.entries(currentPlan.features).map(([key, value]) => {
                  if (!value) return null;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 0", borderTop: "1px solid var(--cr-rule)" }}>
                      <svg width="6" height="6" viewBox="0 0 6 6" fill="none" style={{ flexShrink: 0 }} aria-hidden>
                        <path d="M3 0L6 3L3 6L0 3L3 0Z" fill="var(--cr-copper)" />
                      </svg>
                      <span style={{ ...LABEL, color: "var(--cr-ink-3)" }}>
                        {key.replace(/([A-Z])/g, " $1")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <SuccessFees />

          {!isLaunch && currentPlan.id !== "growth" && (
            <section>
              <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("dashboard.upgradeYourPlan")}</div>
              <div style={CARD}>
                {FOUNDER_PLANS_LIST.filter(p => p.id !== currentPlan.id && p.price > currentPlan.price).map((p, idx) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "16px 20px", borderTop: idx > 0 ? "1px solid var(--cr-rule)" : "none" }}>
                    <div>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", margin: 0 }}>{p.name}</p>
                      <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-3)", marginTop: "2px" }}>
                        <span style={{ ...MONO, fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>${p.price}</span>{t("pricing.perMonth")}
                      </p>
                    </div>
                    <button onClick={() => handleUpgrade(p.id)} style={BTN_OUTLINE}>{t("common.upgrade")}</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

type MyFee = {
  id: string; currency: string | null; closedAt: string | null; payUrl?: string | null;
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

  // Money direction, not decoration: settled fees read up-green, anything
  // still open or contested reads copper, the rest recedes to ink shades.
  const tone: Record<MyFee["state"], string> = {
    collected: "var(--cr-up)", outstanding: "var(--cr-copper)",
    unbillable: "var(--cr-ink-3)", waived: "var(--cr-ink-4)", disputed: "var(--cr-copper)",
  };

  return (
    <section style={{ marginBottom: "32px" }}>
      <div className="ruled-label" style={{ marginBottom: "8px" }}>{t("myFees.title")}</div>
      <p style={{ ...BODY, fontSize: "13px", color: "var(--cr-ink-4)", lineHeight: 1.6, marginBottom: "12px" }}>{t("myFees.intro")}</p>

      <div style={CARD}>
        {fees.map((f, feeIdx) => (
          <div key={f.id} style={{ padding: "16px 20px", borderTop: feeIdx > 0 ? "1px solid var(--cr-rule)" : "none" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ ...MONO, fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", margin: 0, lineHeight: 1.2 }}>
                  {formatMoney(f.feeMajor, f.currency)}
                </p>
                <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "3px" }}>
                  {f.investorName ?? t("myFees.anInvestor")}
                  {f.closedAt && (
                    <> · {t("fees.closed")} <span style={{ ...MONO, fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)" }}>{new Date(f.closedAt).toLocaleDateString()}</span></>
                  )}
                </p>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "12px" }}>
                {/* The pay area. A fee with a live invoice gets the button
                    that actually settles it — Stripe's hosted page, so no
                    card data ever touches this app. */}
                {f.payUrl && (
                  <a href={f.payUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "40px", padding: "0 18px", borderRadius: "999px", background: "var(--cr-copper)", border: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", textDecoration: "none", whiteSpace: "nowrap" }}>
                    {t("myFees.payNow")} ↗
                  </a>
                )}
                <span style={{ ...LABEL, color: tone[f.state] }}>{t(`myFees.state.${f.state}`)}</span>
              </span>
            </div>

            {f.state === "disputed" && (
              <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5, marginTop: "8px" }}>{t("myFees.underReview")}{f.disputeReason ? ` — “${f.disputeReason}”` : ""}</p>
            )}
            {f.resolvedAt && f.disputeResolution && (
              <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5, marginTop: "8px" }}>{t("myFees.resolved")}: {f.disputeResolution}</p>
            )}

            {/* 087: the objection to the fee is usually timing, not amount. */}
            <FeePlan dealId={f.id} state={f.state} onChanged={load} />

            {(f.state === "outstanding" || f.state === "unbillable") && (
              openId === f.id ? (
                <div style={{ marginTop: "12px" }}>
                  <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 1000))}
                    rows={3} placeholder={t("myFees.disputePlaceholder")}
                    style={{ width: "100%", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", ...BODY, fontSize: "13px", color: "var(--cr-ink)", padding: "10px 12px", outline: "none", resize: "vertical" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
                    <button onClick={() => dispute(f.id)} disabled={busy === f.id} style={{ ...BTN_OUTLINE, opacity: busy === f.id ? 0.6 : 1 }}>{t("myFees.submitDispute")}</button>
                    <button onClick={() => { setOpenId(null); setReason(""); }} style={{ ...BTN_TEXT, fontWeight: 400, color: "var(--cr-ink-4)" }}>{t("common.cancel")}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setOpenId(f.id)} style={{ ...BTN_TEXT, color: "var(--cr-copper)", marginTop: "4px" }}>
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
      <div style={{ marginTop: "12px", borderTop: "1px solid var(--cr-rule)", paddingTop: "12px" }}>
        <p style={{ ...LABEL, color: "var(--cr-ink-2)", marginBottom: "8px" }}>
          {t("feePlan.scheduleTitle", { paid, count: data.instalments.length })}
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data.instalments.map((i, idx) => (
            <li key={i.seq} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "6px 0", borderTop: idx > 0 ? "1px solid var(--cr-rule)" : "none" }}>
              <span style={{ ...BODY, fontSize: "12px", color: i.paid_at ? "var(--cr-ink-4)" : "var(--cr-ink-3)", textDecoration: i.paid_at ? "line-through" : "none" }}>
                {t("feePlan.instalmentN", { n: i.seq })} · <span style={{ ...MONO, fontWeight: 400, fontSize: "11px" }}>{new Date(i.due_date).toLocaleDateString()}</span>
              </span>
              <span style={{ ...MONO, fontWeight: 600, fontSize: "12px", color: i.paid_at ? "var(--cr-up)" : "var(--cr-ink)" }}>
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
    <div style={{ marginTop: "12px", borderTop: "1px solid var(--cr-rule)", paddingTop: "12px" }}>
      <p style={{ ...BODY, fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>{t("feePlan.offer")}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <select value={months} onChange={e => setMonths(Number(e.target.value))}
          style={{ minHeight: "40px", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)", padding: "0 10px" }}>
          {Array.from({ length: data.maxMonths - data.minMonths + 1 }, (_, i) => data.minMonths + i).map(m => (
            <option key={m} value={m}>{t("feePlan.months", { n: m })}</option>
          ))}
        </select>
        <button onClick={start} disabled={busy} style={{ ...BTN_OUTLINE, opacity: busy ? 0.6 : 1 }}>{t("feePlan.start")}</button>
      </div>
      <p style={{ ...BODY, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "8px" }}>{t("feePlan.sameTotal")}</p>
    </div>
  );
}
