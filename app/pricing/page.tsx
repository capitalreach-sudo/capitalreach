"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Zap, TrendingUp, Info, Building2, ArrowRight, Brain, X, Sparkles } from "lucide-react";
import { FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST } from "@/lib/plans";
import type { FounderPlan, InvestorPlan } from "@/lib/plans";
import { useLaunchMode } from "@/hooks/useLaunchMode";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";

// ── Feature row builders ──────────────────────────────────────

type FeatureRow = { text: string; on: boolean };

function founderFeatureRows(plan: FounderPlan): FeatureRow[] {
  const f = plan.features;
  return [
    { text: "Public, searchable listing",                                                         on: f.listed },
    { text: "Analytics dashboard",                                                                 on: f.analytics },
    { text: f.documentsLimit > 0 ? `Upload up to ${f.documentsLimit} documents` : "Document uploads", on: f.documentsLimit > 0 },
    { text: "AI pitch feedback",                                                                   on: f.aiPitchFeedback },
    { text: "Featured badge",                                                                      on: f.featuredBadge },
    { text: "Product demo video",                                                                  on: f.demoVideo },
  ];
}

function investorFeatureRows(plan: InvestorPlan): FeatureRow[] {
  const f = plan.features;
  return [
    { text: "Browse startup profiles",     on: f.browseStartups },
    { text: "Financial data & pitch decks", on: f.viewFinancials },
    {
      text: !f.sendMessages
        ? "Direct messaging"
        : f.messageLimit === null
          ? "Unlimited messaging"
          : `Direct messaging (${f.messageLimit}/mo)`,
      on: f.sendMessages,
    },
    { text: "AI due diligence reports", on: f.aiDueDiligence },
    { text: "Export to CSV",            on: f.exportData },
    { text: "Saved searches & filters", on: f.savedSearches },
  ];
}

const FAQ = [
  { q: "How does the 2% success fee work?",
    a: "When an investor marks a deal as closed, we invoice the startup for 2% of the amount raised — after closing. 14-day payment window via Stripe. Zero upfront fees." },
  { q: "What does 'Free until 100 members' mean?",
    a: "We're waiving subscription fees entirely for our first 100 members on the platform. Everyone gets full access to the top tier at no cost. Once we hit 100 members, regular pricing kicks in for new signups — existing launch members keep their plan." },
  { q: "Can I cancel my subscription anytime?",
    a: "Yes. Cancel from your dashboard via the Stripe Customer Portal at any time. You retain access until the end of your billing period." },
  { q: "What counts as a 'closed deal' for the 2% fee?",
    a: "A deal is closed when both parties confirm the investment was completed through a CapitalReach connection. We don't charge for deals made outside the platform." },
  { q: "Do investors pay the success fee?",
    a: "No. The 2% fee is charged only to startups. Investors pay zero transaction fees." },
  { q: "What is accreditation certification?",
    a: "Investors must self-certify as accredited to access financial data. CapitalReach stores this certification and may request documentation for institutional accounts." },
];

// ── Checkout ───────────────────────────────────────────────────

async function startCheckout(planId: string, userType: "founder" | "investor") {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, userType }),
    });
    if (res.status === 401) {
      window.location.href = "/auth/signup";
      return;
    }
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else notify.error(data.error || "Something went wrong");
  } catch {
    notify.error("Something went wrong. Please try again.");
  }
}

// ── Plan Card ──────────────────────────────────────────────────

function PlanCard({
  plan, features, annual, isLaunch, isInstitution, userType,
}: {
  plan: FounderPlan | InvestorPlan;
  features: FeatureRow[];
  annual: boolean;
  isLaunch: boolean;
  isInstitution: boolean;
  userType: "founder" | "investor";
}) {
  const { t } = useTranslation();
  const hi = plan.highlight !== undefined;
  const monthly = isInstitution ? null : plan.price;
  const price   = monthly === null ? null : annual ? Math.round(monthly * 0.8) : monthly;
  const saved   = monthly && annual ? monthly * 0.2 * 12 : 0;
  const free    = monthly === 0;

  function handleClick() {
    if (isInstitution) { window.location.href = "/contact?type=institutional"; return; }
    if (free) { window.location.href = "/auth/signup"; return; }
    startCheckout(plan.id, userType);
  }

  const ctaLabel = isInstitution
    ? "Contact Sales"
    : isLaunch
      ? t("pricing.getStartedFree")
      : free
        ? t("pricing.getStartedFree")
        : `${t("pricing.getStarted")} — ${plan.name}`;

  return (
    <div style={{
      position: "relative", display: "flex", flexDirection: "column",
      borderRadius: "4px", overflow: "hidden",
      border: hi ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule-dark)",
      background: "var(--cr-paper-2)", transition: "border-color 150ms ease",
    }}
      onMouseEnter={e => { if (!hi) (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-paper-4)"; }}
      onMouseLeave={e => { if (!hi) (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; }}>
      {hi && <div style={{ height: "3px", background: "var(--cr-copper)" }} />}

      {hi && (
        <div style={{ position: "absolute", top: "18px", right: "18px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "10px", padding: "3px 8px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <Zap style={{ width: 10, height: 10 }} /> {plan.highlight}
          </span>
        </div>
      )}

      <div style={{ padding: "24px 24px 28px", display: "flex", flexDirection: "column", flex: 1 }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "20px" }}>{plan.name}</p>

        <div style={{ marginBottom: "8px" }}>
          {isLaunch && !isInstitution && !free ? (
            <div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "44px", color: "var(--cr-copper)", lineHeight: 1, letterSpacing: "-0.04em" }}>Free</span>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px", textDecoration: "line-through" }}>
                ${plan.price}/mo after launch
              </p>
            </div>
          ) : price === null ? (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "32px", color: "var(--cr-ink)", lineHeight: 1, letterSpacing: "-0.04em" }}>Custom</span>
          ) : price === 0 ? (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "44px", color: "var(--cr-ink)", lineHeight: 1, letterSpacing: "-0.04em" }}>Free</span>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "44px", lineHeight: 1, letterSpacing: "-0.04em", color: hi ? "var(--cr-copper)" : "var(--cr-ink)" }}>
                ${price}
              </span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "6px" }}>/mo</span>
            </div>
          )}
        </div>
        {!isLaunch && annual && saved > 0 && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", marginBottom: "4px" }}>Save ${Math.round(saved)}/yr with annual</p>
        )}

        <div style={{ height: "1px", background: "var(--cr-rule)", margin: "16px 0 24px" }} />

        <ul style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, marginBottom: "24px" }}>
          {features.map((f) => (
            <li key={f.text} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {(f.on || isLaunch) ? (
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cr-up)" }} />
                </span>
              ) : (
                <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 10, height: "1px", background: "var(--cr-rule-dark)" }} />
                </span>
              )}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: (f.on || isLaunch) ? "var(--cr-ink-3)" : "var(--cr-ink-4)" }}>{f.text}</span>
            </li>
          ))}
        </ul>

        <button onClick={handleClick}
          className={hi || isLaunch ? "btn-copper-shimmer" : ""}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", height: "42px", borderRadius: "4px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
            textDecoration: "none", transition: "opacity 150ms", border: "none", cursor: "pointer",
            background: hi || isLaunch ? "var(--cr-copper)" : "transparent",
            color: hi || isLaunch ? "#fff" : "var(--cr-ink-3)",
            borderColor: hi || isLaunch ? "transparent" : "var(--cr-rule-dark)",
            borderWidth: hi || isLaunch ? 0 : "1px",
            borderStyle: "solid",
          }}
          onMouseEnter={e => {
            if (hi || isLaunch) e.currentTarget.style.opacity = "0.88";
            else { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }
          }}
          onMouseLeave={e => {
            if (hi || isLaunch) e.currentTarget.style.opacity = "1";
            else { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)"; }
          }}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

// ── FAQ Item ───────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--cr-rule)", padding: "20px 0" }}>
      <button onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "none", border: "none", cursor: "pointer", textAlign: "left", gap: "20px",
        }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: open ? "var(--cr-ink)" : "var(--cr-ink-3)", transition: "color 120ms" }}>{q}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--cr-copper)", fontSize: "14px", flexShrink: 0, transition: "transform 200ms", transform: open ? "rotate(180deg)" : "none", display: "inline-block" }}>▾</span>
      </button>
      {open && (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.7, marginTop: "12px" }}>{a}</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function PricingPage() {
  const { t } = useTranslation();
  const [annual,    setAnnual]    = useState(false);
  const [activeTab, setActiveTab] = useState<"startup" | "investor">("startup");
  const { isLaunch, memberCount, target, loading } = useLaunchMode();

  const userType = activeTab === "startup" ? "founder" : "investor";

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)" }}>

        {/* Hero */}
        <section style={{ background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule)", marginTop: "64px", padding: "80px 0 72px" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 40px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "48px", alignItems: "flex-end" }}>
              <div>
                <div className="ruled-label" style={{ marginBottom: "24px" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {!loading && isLaunch ? "Launch pricing" : "Transparent pricing"}
                  </span>
                </div>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, color: "var(--cr-ink)", fontSize: "clamp(48px,7vw,88px)", lineHeight: 0.9, letterSpacing: "-0.03em", marginBottom: "20px" }}>
                  {!loading && isLaunch ? (
                    <>Free for our<br />first {target}.<br /><span style={{ color: "var(--cr-copper)" }}>You in?</span></>
                  ) : (
                    <>Simple<br />pricing.<br /><span style={{ color: "var(--cr-copper)" }}>Start free.</span></>
                  )}
                </h1>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "16px", color: "var(--cr-ink-3)", maxWidth: "360px", lineHeight: 1.7 }}>
                  {!loading && isLaunch ? (
                    <>{memberCount}/{target} members joined. Everyone gets full top-tier access at zero cost — only the <strong style={{ fontWeight: 600, color: "var(--cr-ink)" }}>2% success fee on closed rounds</strong> applies.</>
                  ) : (
                    <>Subscription + just <strong style={{ fontWeight: 600, color: "var(--cr-ink)" }}>2% on closed rounds</strong>. No retainers. No placement fees.</>
                  )}
                </p>
              </div>

              <div style={{ paddingBottom: "8px" }}>
                <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "32px 40px", textAlign: "center" }}>
                  {!loading && isLaunch ? (
                    <>
                      <Sparkles style={{ width: 40, height: 40, color: "var(--cr-copper)", margin: "0 auto 8px" }} />
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--cr-copper)", lineHeight: 1, marginBottom: "8px", fontSize: "40px", letterSpacing: "-0.05em" }}>{Math.max(target - memberCount, 0)}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Spots left free</p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--cr-copper)", lineHeight: 1, marginBottom: "8px", fontSize: "72px", letterSpacing: "-0.05em" }}>2%</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Success fee</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>After closing · zero upfront</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section style={{ padding: "64px 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 40px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", marginBottom: "48px", flexWrap: "wrap" }}>

              {/* Tab switcher */}
              <div style={{ display: "flex", borderBottom: "2px solid var(--cr-rule)", gap: "0" }}>
                {([["startup", Building2, t("pricing.founders")], ["investor", TrendingUp, t("pricing.investors")]] as const).map(([tab, Icon, label]) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    style={{
                      display: "flex", alignItems: "center", gap: "7px",
                      padding: "12px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                      fontSize: "13px", border: "none",
                      borderBottom: `2px solid ${activeTab === tab ? "var(--cr-copper)" : "transparent"}`,
                      marginBottom: "-2px", background: "transparent",
                      color: activeTab === tab ? "var(--cr-copper)" : "var(--cr-ink-4)",
                      cursor: "pointer", transition: "color 120ms, border-color 120ms",
                    }}>
                    <Icon style={{ width: 13, height: 13 }} /> {label}
                  </button>
                ))}
              </div>

              {/* Annual toggle — hidden during launch (pricing isn't live) */}
              {!isLaunch && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: !annual ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>Monthly</span>
                  <button onClick={() => setAnnual((a) => !a)}
                    style={{
                      position: "relative", width: "44px", height: "24px", borderRadius: "12px",
                      border: "none", cursor: "pointer", transition: "background 200ms",
                      background: annual ? "var(--cr-copper)" : "var(--cr-rule-dark)",
                    }}>
                    <span style={{
                      position: "absolute", top: "3px", left: "3px", width: "18px", height: "18px",
                      borderRadius: "50%", background: "#fff", transition: "transform 200ms",
                      transform: annual ? "translateX(20px)" : "none",
                    }} />
                  </button>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: annual ? "var(--cr-ink)" : "var(--cr-ink-4)", display: "flex", alignItems: "center", gap: "6px" }}>
                    Annual
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "10px", color: "var(--cr-copper)", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "3px", padding: "2px 6px" }}>
                      −20%
                    </span>
                  </span>
                </div>
              )}
            </div>

            {activeTab === "startup" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", maxWidth: "900px", marginBottom: "24px" }}>
                {FOUNDER_PLANS_LIST.map((p) => (
                  <PlanCard key={p.id} plan={p} features={founderFeatureRows(p)} annual={annual} isLaunch={isLaunch} isInstitution={false} userType="founder" />
                ))}
              </div>
            )}
            {activeTab === "investor" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "24px" }}>
                {INVESTOR_PLANS_LIST.map((p) => (
                  <PlanCard key={p.id} plan={p} features={investorFeatureRows(p)} annual={annual} isLaunch={isLaunch} isInstitution={p.id === "institution"} userType="investor" />
                ))}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Info style={{ width: 13, height: 13, color: "var(--cr-ink-4)", flexShrink: 0 }} />
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                {activeTab === "startup"
                  ? "All startup plans include a 2% success fee on capital raised through CapitalReach connections."
                  : "Investors pay zero success fees — only your subscription."}
              </p>
            </div>
          </div>
        </section>

        {/* 2% comparison */}
        <section style={{ padding: "72px 0", borderTop: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 40px" }}>
            <div style={{ marginBottom: "48px" }}>
              <div className="ruled-label" style={{ marginBottom: "16px" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>The CapitalReach Model</span>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, color: "var(--cr-ink)", fontSize: "clamp(32px,4vw,52px)", lineHeight: 0.93, letterSpacing: "-0.03em", maxWidth: "480px" }}>
                We only win when<br /><span style={{ color: "var(--cr-copper)" }}>you win.</span>
              </h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "48px" }}>
              {[
                {
                  label: "Traditional Broker", fee: "5–7%",
                  border: "rgba(180,50,50,0.2)", bg: "var(--cr-down-bg)", feeClr: "var(--cr-down)", badge: false, isUs: false,
                  items: ["Large upfront retainer","Annual management fees","5–7% success fees","Slow manual process","Limited deal visibility"],
                },
                {
                  label: "CapitalReach", fee: "2%",
                  border: "var(--cr-copper-br)", bg: "var(--cr-copper-bg)", feeClr: "var(--cr-copper)", badge: true, isUs: true,
                  items: ["Zero upfront fees","Optional subscription","2% on closed rounds","AI-powered speed","Full pipeline visibility"],
                },
                {
                  label: "DIY Fundraising", fee: "0%",
                  border: "var(--cr-rule-dark)", bg: "var(--cr-paper-3)", feeClr: "var(--cr-ink-4)", badge: false, isUs: false,
                  items: ["Hundreds of cold emails","No investor filtering","No AI matching","No deal tracking","Months of effort"],
                },
              ].map((col) => (
                <div key={col.label} style={{ position: "relative", borderRadius: "4px", border: `1px solid ${col.border}`, padding: "28px", background: col.bg }}>
                  {col.badge && (
                    <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)" }}>
                      <span style={{ background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "10px", padding: "4px 12px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>✓ Best Value</span>
                    </div>
                  )}
                  <div style={{ textAlign: "center", marginBottom: "24px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>{col.label}</p>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, lineHeight: 1, marginBottom: "4px", fontSize: "52px", letterSpacing: "-0.05em", color: col.feeClr }}>{col.fee}</p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.12em" }}>success fee</p>
                  </div>
                  <ul style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {col.items.map((item) => (
                      <li key={item} style={{ display: "flex", alignItems: "center", gap: "10px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>
                        {col.isUs
                          ? <span style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cr-up)" }} /></span>
                          : <X style={{ width: 12, height: 12, color: "var(--cr-ink-4)", flexShrink: 0 }} />
                        }
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <Link href="/auth/signup"
                className="btn-copper-shimmer"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "0 28px", height: "44px", borderRadius: "4px", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                {t("hero.ctaPrimary")} <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>
              <Link href="/auth/signup"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", padding: "0 28px", height: "44px", borderRadius: "4px", textDecoration: "none", background: "var(--cr-paper)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)"; }}>
                Browse as Investor
              </Link>
            </div>
          </div>
        </section>

        {/* AI report callout */}
        <section style={{ padding: "40px 0", borderTop: "1px solid var(--cr-rule)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 40px" }}>
            <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px 28px", display: "flex", alignItems: "center", gap: "24px", transition: "border-color 150ms" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper-br)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}>
              <div style={{ width: 48, height: 48, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Brain style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "4px" }}>AI Due Diligence Reports</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>Comprehensive AI analysis on any startup — market sizing, moat, key risks, and investment thesis in seconds.</p>
              </div>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)" }}>Included with Pro Investor</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ padding: "72px 0", borderTop: "1px solid var(--cr-rule)" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 40px" }}>
            <div style={{ marginBottom: "48px" }}>
              <div className="ruled-label" style={{ marginBottom: "16px" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>FAQ</span>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(26px,3.5vw,42px)", color: "var(--cr-ink)", letterSpacing: "-0.03em" }}>
                Common questions
              </h2>
            </div>
            <div style={{ borderTop: "1px solid var(--cr-rule)" }}>
              {FAQ.map((item) => <FaqItem key={item.q} q={item.q} a={item.a} />)}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ padding: "72px 0", borderTop: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 40px" }}>
            <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
              <div style={{ height: "3px", background: "var(--cr-copper)" }} />
              <div style={{ padding: "64px 80px", textAlign: "center" }}>
                <div className="ruled-label" style={{ justifyContent: "center", marginBottom: "24px" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {!loading && isLaunch ? "Limited launch spots" : "Early Access"}
                  </span>
                </div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, color: "var(--cr-ink)", fontSize: "clamp(32px,4.5vw,60px)", lineHeight: 0.93, letterSpacing: "-0.03em", marginBottom: "20px", maxWidth: "560px", margin: "0 auto 20px" }}>
                  Ready to find your<br /><span style={{ color: "var(--cr-copper)" }}>next investment?</span>
                </h2>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", marginBottom: "40px", maxWidth: "360px", margin: "0 auto 40px", lineHeight: 1.7 }}>
                  {!loading && isLaunch
                    ? `Join the first ${target} members and get full access for free — no card required.`
                    : "Join the early community of founders and investors on CapitalReach. Start free today."}
                </p>
                <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                  <Link href="/auth/signup"
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px", padding: "0 32px", height: "48px", borderRadius: "4px", textDecoration: "none" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                    List Your Startup Free <ArrowRight style={{ width: 14, height: 14 }} />
                  </Link>
                  <Link href="/auth/signup"
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", padding: "0 32px", height: "48px", borderRadius: "4px", textDecoration: "none", background: "var(--cr-paper)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)"; }}>
                    Browse as Investor
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
