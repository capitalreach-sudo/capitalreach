"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Zap, TrendingUp, Info, Building2, ArrowRight, Brain, X, Sparkles } from "lucide-react";
import { FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST, annualPricingFrom } from "@/lib/plans";
import type { FounderPlan, InvestorPlan } from "@/lib/plans";
// Type only: lib/pricing-stage reaches the database, so the value side of it
// must never be pulled into the client bundle. The numbers arrive as props,
// resolved on the server by app/pricing/page.tsx.
import type { PricingStage } from "@/lib/pricing-stage";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { PlanComparison } from "@/components/pricing/plan-comparison";
import { FeeCalculator } from "@/components/ui/FeeCalculator";
import { FeeSlider } from "@/components/homepage/fee-slider";
import { founderCan, investorCan } from "@/lib/access";

/** What one plan costs at the live stage, and what it will cost at the next. */
export interface StagePrice {
  price: number;
  annualPrice: number | null;
  /** The next stage's monthly price; null once the ladder is at standard. */
  nextPrice: number | null;
}

export interface StagePricing {
  stage: PricingStage;
  memberCount: number;
  target: number;
  isFounding: boolean;
  founder: Record<string, StagePrice>;
  investor: Record<string, StagePrice>;
}

// ── Feature row builders ──────────────────────────────────────

type FeatureRow = { text: string; on: boolean; tip: string };
type TFn = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Rows are DERIVED from the same capability functions the product enforces
 * (lib/access.ts), evaluated as a signed-in user of that plan would be. The
 * page therefore cannot promise something a tier does not do, or hide
 * something it does -- the earlier table said Free founders had no public
 * listing while founderCan() listed them.
 */
function founderFeatureRows(plan: FounderPlan, t: TFn): FeatureRow[] {
  const c = founderCan({ userId: "x", role: "startup", tier: plan.id, isLaunchMode: false, suspended: false });
  return [
    { text: c.listingLimit === Infinity ? t("pricing.feature_unlimitedListings") : t("pricing.feature_oneListing"), on: c.listStartup, tip: t("pricing.tipListings") },
    { text: t("pricing.feature_publicListing"),   on: c.listStartup,       tip: t("pricing.tipPublicListing") },
    { text: c.docLimit === Infinity ? t("pricing.feature_unlimitedDocs") : c.docLimit > 0 ? t("pricing.feature_uploadDocs", { n: c.docLimit }) : t("pricing.feature_docUploads"), on: c.docLimit > 0, tip: t("pricing.tipDocs") },
    { text: t("pricing.feature_nda"),             on: c.useNDA,            tip: t("pricing.tipNda") },
    { text: t("pricing.feature_aiPitchFeedback"), on: c.aiPitchScore,      tip: t("pricing.tipAiScore") },
    { text: t("pricing.feature_seeWhoViewed"),    on: c.seeInvestorIdentity, tip: t("pricing.tipAnalytics") },
    { text: t("pricing.feature_analyticsBoard"),  on: c.analyticsLevel === "full", tip: t("pricing.tipAnalytics") },
    { text: t("pricing.feature_priority"),        on: c.priorityReview,    tip: t("pricing.tipPriority") },
    { text: t("pricing.feature_demoVideo"),       on: c.demoVideo,         tip: t("pricing.tipDemoVideo") },
  ];
}

function investorFeatureRows(plan: InvestorPlan, t: TFn): FeatureRow[] {
  const c = investorCan({ userId: "x", role: "investor", tier: plan.id === "pro" ? "pro_investor" : plan.id === "institution" ? "institutional" : plan.id, isLaunchMode: false, suspended: false });
  return [
    { text: t("pricing.feature_browseStartups"),   on: c.browse,         tip: t("pricing.tipBrowse") },
    { text: t("pricing.feature_financials"),        on: c.viewFinancials, tip: t("pricing.tipFinancials") },
    { text: t("pricing.feature_teamDocs"),          on: c.viewTeam,       tip: t("pricing.tipVisTeam") },
    {
      text: !c.message
        ? t("pricing.feature_messaging")
        : c.messageLimit === Infinity
          ? t("pricing.feature_unlimitedMessaging")
          : t("pricing.feature_messagingLimit", { n: c.messageLimit }),
      on: c.message,
      tip: t("pricing.tipMessaging"),
    },
    { text: t("pricing.feature_investorMatching"), on: c.aiMatching,     tip: t("pricing.tipMatching") },
    {
      text: c.aiDiligence === "paid" ? t("pricing.feature_aiDiligencePaid") : t("pricing.feature_aiDiligence"),
      on: c.aiDiligence !== "no",
      tip: t("pricing.tipDiligence"),
    },
    { text: c.watchlistLimit === Infinity ? t("pricing.feature_watchlistUnlimited") : t("pricing.feature_watchlistLimited", { n: c.watchlistLimit }), on: true, tip: t("pricing.tipWatchlist") },
    { text: t("pricing.feature_exportCsv"),         on: c.dataExport,     tip: t("pricing.tipExport") },
    { text: t("pricing.feature_savedSearches"),     on: c.savedSearches,  tip: t("pricing.tipSavedSearches") },
  ];
}

// ── Checkout ───────────────────────────────────────────────────

async function startCheckout(planId: string, userType: "founder" | "investor", errorMessage: string, interval: "month" | "year" = "month") {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, userType, interval }),
    });
    if (res.status === 401) {
      window.location.href = "/auth/signup";
      return;
    }
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else notify.error(data.error || errorMessage);
  } catch {
    notify.error(errorMessage);
  }
}

// ── Plan Card ──────────────────────────────────────────────────

function PlanCard({
  plan, money, features, annual, isFounding, isInstitution, userType, isCurrent,
}: {
  plan: FounderPlan | InvestorPlan;
  money: StagePrice;
  features: FeatureRow[];
  annual: boolean;
  isFounding: boolean;
  isInstitution: boolean;
  userType: "founder" | "investor";
  isCurrent?: boolean;
}) {
  const { t } = useTranslation();
  const hi = plan.highlight !== undefined;
  // Every figure on the card is the STAGE price, never plan.price: lib/plans.ts
  // stays the source of truth for what a tier can do, lib/pricing-stage.ts for
  // what it costs a new subscriber today.
  const monthly = isInstitution ? null : money.price;
  const yearly  = annualPricingFrom(money.price, money.annualPrice);
  const price   = monthly === null ? null : annual && yearly ? yearly.effectiveMonthly : monthly;
  const saved   = annual && yearly ? yearly.saved : 0;
  const free    = monthly === 0;
  // Only ever shown when the next stage is dearer, so the line is a warning to
  // the reader rather than a boast.
  const rising  = !isInstitution && money.nextPrice !== null && money.nextPrice > money.price ? money.nextPrice : null;
  const risingParts = t("pricing.risingTo").split("{amount}");

  async function handleClick() {
    // The viewer already has this plan: the only sensible action is managing
    // it, not buying it again. Free current plans have nothing to manage.
    if (isCurrent) {
      if (free) return;
      const res = await fetch("/api/checkout/portal", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (data?.url) window.location.href = data.url;
      else notify.error(t("errors.generic"));
      return;
    }
    if (isInstitution) { window.location.href = "/contact?type=institutional"; return; }

    // Carry the chosen plan into signup. It used to be dropped entirely --
    // clicking a plan landed you on a bare signup form with no sign that a
    // choice had been made, which reads as the click not having worked.
    //
    // The founding stage is routed here too: nothing is for sale while it
    // runs, and /api/checkout refuses to open a session, so sending someone to
    // Stripe would be sending them to an error.
    const signupUrl = `/auth/signup?plan=${encodeURIComponent(plan.id)}&role=${userType === "founder" ? "startup" : "investor"}`;
    if (free || isFounding) { window.location.href = signupUrl; return; }

    startCheckout(plan.id, userType, t("errors.generic"), annual ? "year" : "month");
  }

  const ctaLabel = isCurrent
    ? (free ? t("dashboard.currentPlan") : t("dashboard.manageBilling"))
    : isInstitution
    ? t("pricing.contactSales")
    : free
      ? t("pricing.getStartedFree")
      : `${t("pricing.getStarted")} — ${plan.name}`;

  return (
    <div className={hi ? "plan-card featured" : "plan-card"}
      style={{
        position: "relative", display: "flex", flexDirection: "column",
        borderRadius: "4px", overflow: "hidden",
        border: hi ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule-dark)",
        transition: "border-color 150ms ease",
      }}
      onMouseEnter={e => { if (!hi) (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-paper-4)"; }}
      onMouseLeave={e => { if (!hi) (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; }}>
      {hi && <div style={{ height: "3px", background: "var(--cr-copper)" }} />}

      {isCurrent && (
        <div style={{ position: "absolute", top: "18px", right: "18px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "transparent", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "10px", padding: "3px 8px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("dashboard.currentPlan")}
          </span>
        </div>
      )}
      {hi && !isCurrent && (
        <div style={{ position: "absolute", top: "18px", right: "18px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "10px", padding: "3px 8px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <Zap style={{ width: 10, height: 10 }} /> {plan.highlight}
          </span>
        </div>
      )}

      <div style={{ padding: "24px", display: "flex", flexDirection: "column", flex: 1 }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "20px" }}>{plan.name}</p>

        <div style={{ marginBottom: "8px" }}>
          {price === null ? (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "32px", color: "var(--cr-ink)", lineHeight: 1, letterSpacing: "-0.04em" }}>{t("common.custom")}</span>
          ) : price === 0 ? (
            // Copper only when the stage is what makes it free -- a plan that
            // is free at every stage is not a discount and must not read as one.
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "44px", color: rising ? "var(--cr-copper)" : "var(--cr-ink)", lineHeight: 1, letterSpacing: "-0.04em" }}>{t("pricing.free")}</span>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "44px", lineHeight: 1, letterSpacing: "-0.04em", color: hi ? "var(--cr-copper)" : "var(--cr-ink)" }}>
                ${price}
              </span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "6px" }}>{t("pricing.perMonth")}{annual && yearly ? ` · ${t("pricing.billedYearly", { amount: yearly.total })}` : ""}</span>
            </div>
          )}
        </div>

        {rising !== null && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "4px" }}>
            {risingParts[0]}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: "var(--cr-ink-3)" }}>${rising}</span>
            {risingParts[1]}
          </p>
        )}
        {annual && saved > 0 && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", marginBottom: "4px" }}>{t("pricing.saveAnnual", { amount: Math.round(saved) })} · <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{yearly?.percentOff}%</span></p>
        )}

        <div style={{ height: "1px", background: "var(--cr-rule)", margin: "16px 0 24px" }} />

        <ul style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, marginBottom: "24px" }}>
          {features.map((f) => (
            <li key={f.text} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {f.on ? (
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cr-copper)" }} />
                </span>
              ) : (
                <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 10, height: "1px", background: "var(--cr-rule-dark)" }} />
                </span>
              )}
              <span data-tip={f.tip} tabIndex={0} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: f.on ? "var(--cr-ink-3)" : "var(--cr-ink-4)" }}>{f.text}</span>
            </li>
          ))}
        </ul>

        <button onClick={handleClick}
          className={hi || isFounding ? "btn-copper-shimmer" : ""}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", height: "42px", borderRadius: "4px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
            textDecoration: "none", transition: "opacity 150ms", border: "none", cursor: "pointer",
            background: hi || isFounding ? "var(--cr-copper)" : "transparent",
            color: hi || isFounding ? "var(--cr-band-ink)" : "var(--cr-ink-3)",
            borderColor: hi || isFounding ? "transparent" : "var(--cr-rule-dark)",
            borderWidth: hi || isFounding ? 0 : "1px",
            borderStyle: "solid",
          }}
          onMouseEnter={e => {
            if (hi || isFounding) e.currentTarget.style.opacity = "0.88";
            else { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }
          }}
          onMouseLeave={e => {
            if (hi || isFounding) e.currentTarget.style.opacity = "1";
            else { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)"; }
          }}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

// ── Stage banner ───────────────────────────────────────────────

/**
 * The page opens by saying which rung of the ladder the reader is standing on.
 * It also says, in the same breath, that the 2% success fee is NOT on the
 * ladder -- "prices rise later" next to a percentage invites the reading that
 * the percentage rises too.
 */
function StageBanner({ pricing }: { pricing: StagePricing }) {
  const { t } = useTranslation();
  if (pricing.stage === "standard") return null;

  return (
    <section style={{ background: "var(--cr-paper-2)", borderBottom: "1px solid var(--cr-rule)", marginTop: "64px", padding: "12px 0" }}>
      <div className="max-w-[1200px] mx-auto px-6 md:px-10"
        style={{ display: "flex", alignItems: "center", gap: "12px 16px", flexWrap: "wrap" }}>
        <span className="ruled-label" style={{ color: "var(--cr-copper)" }}>
          {t(pricing.isFounding ? "stage.founding" : "stage.early")}
        </span>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)" }}>
          {pricing.isFounding
            ? t("pricing.stageBannerFounding", { target: pricing.target })
            : t("pricing.stageBannerEarly")}
        </p>
        {pricing.isFounding && (
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: "6px" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "13px", color: "var(--cr-copper)", fontVariantNumeric: "tabular-nums" }}>
              {pricing.memberCount}/{pricing.target}
            </span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              {t("pricing.stageMembersLabel")}
            </span>
          </span>
        )}
        <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "9px" }}>✦</span>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>
          {t("pricing.stageFeeNote")}
        </p>
      </div>
    </section>
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
export function PricingClient({ pricing }: { pricing: StagePricing }) {
  const { t } = useTranslation();
  const [annual,    setAnnual]    = useState(false);
  const [activeTab, setActiveTab] = useState<"startup" | "investor">("startup");
  const { isFounding, memberCount, target } = pricing;

  // The badge on the annual toggle has to be true of at least one plan and no
  // more than any -- computed over the STAGE prices, since those are what the
  // toggle actually switches between.
  const bestAnnualDiscount = useMemo(
    () => Math.max(
      0,
      ...[...Object.values(pricing.founder), ...Object.values(pricing.investor)]
        .map(m => annualPricingFrom(m.price, m.annualPrice)?.percentOff ?? 0),
    ),
    [pricing],
  );

  // Checkout bounce-backs used to land here SILENTLY -- "selecting a plan
  // doesn't change anything" was this page eating the error param.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("error") === "price_unavailable" || q.get("error") === "checkout_failed") {
      notify.error(t("pricing.checkoutUnavailable"));
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Who is looking, and what do they already pay for? Signed-in viewers get
  // their own plan marked and its CTA routed to the billing portal instead of
  // a second checkout -- and land on the tab for their own role.
  const [viewer, setViewer] = useState<{ role: string; tier: string | null } | null>(null);
  const supabaseRef = useRef(createClient());
  useEffect(() => {
    const supabase = supabaseRef.current;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase
        .from("profiles").select("role, subscription_tier").eq("id", data.user.id).maybeSingle();
      if (!p) return;
      setViewer({ role: p.role, tier: p.subscription_tier });
      if (p.role === "investor") setActiveTab("investor");
    });
    // Footer links promise /pricing#founders and /pricing#investors; the hash
    // both scrolls here and selects the matching tab, so the link keeps its
    // whole promise rather than landing on the wrong table.
    const hash = window.location.hash;
    if (hash === "#investors") setActiveTab("investor");
    if (hash === "#founders") setActiveTab("startup");
  }, []);

  // profiles.subscription_tier -> plan id (the set-tier route writes
  // pro_investor/institutional; the plan list says pro/institution).
  const currentPlanId =
    viewer === null ? null
    : viewer.role === "startup"
      ? (viewer.tier === "starter" || viewer.tier === "growth" ? viewer.tier : "free")
      : viewer.role === "investor"
        ? (viewer.tier === "angel" ? "angel"
          : viewer.tier === "pro_investor" ? "pro"
          : viewer.tier === "institutional" ? "institution"
          : "free")
        : null;
  const currentTabForViewer = viewer?.role === "startup" ? "startup" : viewer?.role === "investor" ? "investor" : null;

  const faqItems = [
    { q: t("pricing.faq.q1"), a: t("pricing.faq.a1") },
    { q: t("pricing.faq.q2"), a: t("pricing.faq.a2") },
    { q: t("pricing.faq.q3"), a: t("pricing.faq.a3") },
    { q: t("pricing.faq.q4"), a: t("pricing.faq.a4") },
    { q: t("pricing.faq.q5"), a: t("pricing.faq.a5") },
    { q: t("pricing.faq.q6"), a: t("pricing.faq.a6") },
  ];

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)" }}>

        <StageBanner pricing={pricing} />

        {/* Hero -- the banner above already clears the fixed navbar when it is
            on screen, so the offset moves with it. */}
        <section style={{ background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule)", marginTop: pricing.stage === "standard" ? "64px" : 0, padding: "64px 0" }}>
          <div className="max-w-[1200px] mx-auto px-6 md:px-10">
            <div className="pricing-hero-grid">
              <div>
                <div className="ruled-label" style={{ marginBottom: "24px" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {isFounding ? t("pricing.launchPricingLabel") : t("pricing.transparentPricingLabel")}
                  </span>
                </div>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, color: "var(--cr-ink)", fontSize: "clamp(48px,7vw,88px)", lineHeight: 0.9, letterSpacing: "-0.03em", marginBottom: "20px" }}>
                  {isFounding ? (
                    <>{t("pricing.launchHeadlineLine1")}<br />{t("pricing.launchHeadlineLine2", { target })}<br /><span style={{ color: "var(--cr-copper)" }}>{t("pricing.launchHeadlineLine3")}</span></>
                  ) : (
                    <>{t("pricing.headlineLine1")}<br />{t("pricing.headlineLine2")}<br /><span style={{ color: "var(--cr-copper)" }}>{t("pricing.headlineLine3")}</span></>
                  )}
                </h1>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "16px", color: "var(--cr-ink-3)", maxWidth: "360px", lineHeight: 1.7 }}>
                  {isFounding ? (
                    <>
                      {t("pricing.launchSub", { memberCount, target }).split("{bold}")[0]}
                      <strong style={{ fontWeight: 600, color: "var(--cr-ink)" }}>{t("pricing.launchSubBold")}</strong>
                      {t("pricing.launchSub", { memberCount, target }).split("{bold}")[1]}
                    </>
                  ) : (
                    <>
                      {t("pricing.sub").split("{bold}")[0]}
                      <strong style={{ fontWeight: 600, color: "var(--cr-ink)" }}>{t("pricing.subBold")}</strong>
                      {t("pricing.sub").split("{bold}")[1]}
                    </>
                  )}
                </p>
              </div>

              <div style={{ paddingBottom: "8px" }}>
                <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "32px 40px", textAlign: "center" }}>
                  {isFounding ? (
                    <>
                      <Sparkles style={{ width: 40, height: 40, color: "var(--cr-copper)", margin: "0 auto 8px" }} />
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--cr-copper)", lineHeight: 1, marginBottom: "8px", fontSize: "40px", letterSpacing: "-0.05em" }}>{Math.max(target - memberCount, 0)}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.15em" }}>{t("pricing.spotsLeftFree")}</p>
                    </>
                  ) : (
                    <>
                      <p className="copper-foil" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, lineHeight: 1, marginBottom: "8px", fontSize: "72px", letterSpacing: "-0.05em" }}>2%</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.15em" }}>{t("pricing.successFeeLabel")}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>{t("pricing.afterClosingUpfront")}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The fee, felt: the slider moved here from the homepage -- the
            pricing page opens with the only number that matters, movable. */}
        <FeeSlider />

        {/* Plans */}
        <section id="founders" style={{ padding: "64px 0", scrollMarginTop: "60px" }}>
          <span id="investors" aria-hidden />
          <div className="max-w-[1200px] mx-auto px-6 md:px-10">
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

              {/* Annual toggle -- hidden while the stage charges nothing */}
              {bestAnnualDiscount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: !annual ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>{t("pricing.monthly")}</span>
                  <button onClick={() => setAnnual((a) => !a)}
                    style={{
                      position: "relative", width: "44px", height: "24px", borderRadius: "12px",
                      border: "none", cursor: "pointer", transition: "background 200ms",
                      background: annual ? "var(--cr-copper)" : "var(--cr-rule-dark)",
                    }}>
                    <span style={{
                      position: "absolute", top: "3px", left: "3px", width: "18px", height: "18px",
                      borderRadius: "50%", background: "var(--cr-band-ink)", transition: "transform 200ms",
                      transform: annual ? "translateX(20px)" : "none",
                    }} />
                  </button>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: annual ? "var(--cr-ink)" : "var(--cr-ink-4)", display: "flex", alignItems: "center", gap: "6px" }}>
                    {t("pricing.annual")}
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "10px", color: "var(--cr-copper)", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "3px", padding: "2px 6px" }}>
                      {t("pricing.saveUpTo", { percent: bestAnnualDiscount })}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* 2% success fee callout */}
            <div style={{
              display: "flex", alignItems: "center", gap: "20px",
              background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)",
              borderRadius: "4px", padding: "16px 20px", marginBottom: "24px",
            }}>
              <div style={{
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                width: "40px", height: "40px",
                background: "var(--cr-copper-bg)", borderRadius: "4px",
                border: "1px solid var(--cr-copper-br)",
              }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "13px", color: "var(--cr-copper)", letterSpacing: "-0.03em" }}>2%</span>
              </div>
              <div>
                {activeTab === "startup" ? (
                  <>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "2px" }}>
                      {t("pricing.oneSuccessFeeTitle")}
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>
                      {t("pricing.founderFeeBody").split("{bold}")[0]}
                      <strong style={{ fontWeight: 600, color: "var(--cr-copper)" }}>{t("pricing.founderFeeBodyBold")}</strong>
                      {t("pricing.founderFeeBody").split("{bold}")[1]}
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "2px" }}>
                      {t("pricing.investorZeroFeeTitle")}
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>
                      {t("pricing.investorFeeBody").split("{bold}")[0]}
                      <strong style={{ fontWeight: 600, color: "var(--cr-copper)" }}>{t("pricing.investorFeeBodyBold")}</strong>
                      {t("pricing.investorFeeBody").split("{bold}")[1]}
                    </p>
                  </>
                )}
              </div>
            </div>

            {activeTab === "startup" && (
              <>
                <div className="grid-plans-3" style={{ maxWidth: "900px", marginBottom: "24px" }}>
                  {FOUNDER_PLANS_LIST.map((p) => (
                    <PlanCard key={p.id} plan={p} money={pricing.founder[p.id]} features={founderFeatureRows(p, t)} annual={annual} isFounding={isFounding} isInstitution={false} userType="founder" isCurrent={currentTabForViewer === "startup" && currentPlanId === p.id} />
                  ))}
                </div>
                <PlanComparison side="founder" isLaunch={isFounding} />
              </>
            )}
            {activeTab === "investor" && (
              <>
                <div className="grid-plans-4" style={{ marginBottom: "24px" }}>
                  {INVESTOR_PLANS_LIST.map((p) => (
                    <PlanCard key={p.id} plan={p} money={pricing.investor[p.id]} features={investorFeatureRows(p, t)} annual={annual} isFounding={isFounding} isInstitution={p.id === "institution"} userType="investor" isCurrent={currentTabForViewer === "investor" && currentPlanId === p.id} />
                  ))}
                </div>
                <PlanComparison side="investor" isLaunch={isFounding} />
              </>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Info style={{ width: 13, height: 13, color: "var(--cr-ink-4)", flexShrink: 0 }} />
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                {activeTab === "startup"
                  ? t("pricing.founderInfoLine")
                  : t("pricing.investorInfoLine")}
              </p>
            </div>
          </div>
        </section>

        {/* 2% comparison */}
        <section style={{ padding: "64px 0", borderTop: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)" }}>
          <div className="max-w-[1200px] mx-auto px-6 md:px-10">
            <div style={{ marginBottom: "48px" }}>
              <div className="ruled-label" style={{ marginBottom: "16px" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("pricing.modelEyebrow")}</span>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, color: "var(--cr-ink)", fontSize: "clamp(32px,4vw,52px)", lineHeight: 0.93, letterSpacing: "-0.03em", maxWidth: "480px" }}>
                {t("pricing.winHeadline")}
              </h2>
            </div>

            <div className="grid-plans-3" style={{ marginBottom: "48px" }}>
              {[
                {
                  label: t("pricing.colTraditional"), fee: "5–7%",
                  border: "color-mix(in srgb, var(--cr-down) 20%, transparent)", bg: "var(--cr-down-bg)", feeClr: "var(--cr-down)", badge: false, isUs: false,
                  items: [t("pricing.tradItem1"), t("pricing.tradItem2"), t("pricing.tradItem3"), t("pricing.tradItem4"), t("pricing.tradItem5")],
                },
                {
                  label: "CapitalReach", fee: "2%",
                  border: "var(--cr-copper-br)", bg: "var(--cr-copper-bg)", feeClr: "var(--cr-copper)", badge: true, isUs: true,
                  items: [t("pricing.crItem1"), t("pricing.crItem2"), t("pricing.crItem3"), t("pricing.crItem4"), t("pricing.crItem5")],
                },
                {
                  label: t("pricing.colDiy"), fee: "0%",
                  border: "var(--cr-rule-dark)", bg: "var(--cr-paper-3)", feeClr: "var(--cr-ink-4)", badge: false, isUs: false,
                  items: [t("pricing.diyItem1"), t("pricing.diyItem2"), t("pricing.diyItem3"), t("pricing.diyItem4"), t("pricing.diyItem5")],
                },
              ].map((col) => (
                <div key={col.label} style={{ position: "relative", borderRadius: "4px", border: `1px solid ${col.border}`, padding: "24px", background: col.bg }}>
                  {col.badge && (
                    <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)" }}>
                      <span style={{ background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "10px", padding: "4px 12px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>✓ {t("pricing.bestValue")}</span>
                    </div>
                  )}
                  <div style={{ textAlign: "center", marginBottom: "24px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>{col.label}</p>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, lineHeight: 1, marginBottom: "4px", fontSize: "52px", letterSpacing: "-0.05em", color: col.feeClr }}>{col.fee}</p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{t("pricing.successFeeLower")}</p>
                  </div>
                  <ul style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {col.items.map((item) => (
                      <li key={item} style={{ display: "flex", alignItems: "center", gap: "10px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>
                        {col.isUs
                          ? <span style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cr-copper)" }} /></span>
                          : <X style={{ width: 12, height: 12, color: "var(--cr-ink-4)", flexShrink: 0 }} />
                        }
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Interactive 2% calculator (Phase 1, mechanism D): the same
                comparison as the columns above, but on the reader's own number. */}
            <div className="grid-plans-3" style={{ marginBottom: "40px", alignItems: "start" }}>
              <div style={{ gridColumn: "1 / -1", maxWidth: "560px" }}>
                <FeeCalculator variant="raise" currency="EUR" defaultAmount={500_000} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link href="/auth/signup"
                className="btn-copper-shimmer"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "0 28px", height: "44px", borderRadius: "4px", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                {t("hero.ctaPrimary")} <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>
              <Link href="/auth/signup"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", padding: "0 28px", height: "44px", borderRadius: "4px", textDecoration: "none", background: "var(--cr-paper)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)"; }}>
                {t("pricing.browseAsInvestor")}
              </Link>
            </div>
          </div>
        </section>

        {/* AI report callout */}
        <section style={{ padding: "48px 0", borderTop: "1px solid var(--cr-rule)" }}>
          <div className="max-w-[1200px] mx-auto px-6 md:px-10">
            {/* flexWrap: three fixed-width flex children overflowed a 375px
                screen by 23px and put a sideways scroll on the whole page. */}
            <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px", display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap", transition: "border-color 150ms" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper-br)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}>
              <div style={{ width: 48, height: 48, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Brain style={{ width: 22, height: 22, color: "var(--cr-copper)" }} />
              </div>
              <div style={{ flex: 1, minWidth: "220px" }}>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("pricing.aiReportTitle")}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>{t("pricing.aiReportDesc")}</p>
              </div>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)" }}>{t("pricing.aiReportIncluded")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ padding: "64px 0", borderTop: "1px solid var(--cr-rule)" }}>
          <div className="max-w-[800px] mx-auto px-6 md:px-10">
            <div style={{ marginBottom: "48px" }}>
              <div className="ruled-label" style={{ marginBottom: "16px" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>FAQ</span>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(26px,3.5vw,42px)", color: "var(--cr-ink)", letterSpacing: "-0.03em" }}>
                {t("pricing.commonQuestions")}
              </h2>
            </div>
            <div style={{ borderTop: "1px solid var(--cr-rule)" }}>
              {faqItems.map((item) => <FaqItem key={item.q} q={item.q} a={item.a} />)}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ padding: "64px 0", borderTop: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)" }}>
          <div className="max-w-[1200px] mx-auto px-6 md:px-10">
            <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
              <div style={{ height: "3px", background: "var(--cr-copper)" }} />
              <div style={{ padding: "64px 24px", textAlign: "center" }}>
                <div className="ruled-label" style={{ justifyContent: "center", marginBottom: "24px" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {isFounding ? t("pricing.limitedLaunchSpots") : t("pricing.earlyAccess")}
                  </span>
                </div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, color: "var(--cr-ink)", fontSize: "clamp(32px,4.5vw,60px)", lineHeight: 0.93, letterSpacing: "-0.03em", marginBottom: "20px", maxWidth: "560px", margin: "0 auto 20px" }}>
                  {t("pricing.ctaHeadline")}
                </h2>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", marginBottom: "40px", maxWidth: "360px", margin: "0 auto 40px", lineHeight: 1.7 }}>
                  {isFounding
                    ? t("pricing.finalCtaLaunchSub", { target })
                    : t("pricing.finalCtaSub")}
                </p>
                <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                  <Link href="/auth/signup"
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px", padding: "0 32px", height: "48px", borderRadius: "4px", textDecoration: "none" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                    {t("pricing.listStartupFree")} <ArrowRight style={{ width: 14, height: 14 }} />
                  </Link>
                  <Link href="/auth/signup"
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", padding: "0 32px", height: "48px", borderRadius: "4px", textDecoration: "none", background: "var(--cr-paper)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)"; }}>
                    {t("pricing.browseAsInvestor")}
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
