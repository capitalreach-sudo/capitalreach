"use client";
import { formatMoney } from "@/lib/currency";

import { BROKER_BENCHMARK_PERCENT, SUCCESS_FEE_PERCENT } from "@/lib/circumvention-text";
import { useState, useEffect, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Zap, Info, ArrowRight, Brain, Sparkles } from "lucide-react";
import { TabStrip, TabPanel } from "@/components/ui/tab-strip";
import { FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST, annualPricingFrom, PLAN_CURRENCY} from "@/lib/plans";
import type { FounderPlan, InvestorPlan } from "@/lib/plans";
// Type only: lib/pricing-stage reaches the database, so the value side of it
// must never be pulled into the client bundle. The numbers arrive as props,
// resolved on the server by app/pricing/page.tsx.
import type { PricingStage } from "@/lib/pricing-stage";
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

/** The signed-in viewer, resolved on the server; null for an anonymous visitor. */
export interface PricingViewer {
  /** Holds a Stripe customer: only then can the billing portal open. A tier set
   *  by an admin or a grant has none, and the portal would only error. */
  hasBillingAccount?: boolean;
  role: string | null;
  tier: string | null;
}

/** Where a member's own work lives. A member with no role yet goes to the fork. */
function dashboardHref(role: string | null): string {
  return role === "startup" ? "/dashboard/startup"
    : role === "investor" ? "/dashboard/investor"
    : role === "admin" ? "/admin"
    : "/onboarding";
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

// ── Fee comparison ─────────────────────────────────────────────
//
// Three ways the same round gets charged, set as a ledger: one fact per cell,
// all three routes described in the same voice. The middle column is ours and
// is marked by copper rules rather than by a ribbon it awarded itself, and the
// other two are described rather than disparaged -- a house that tells you the
// alternative is hopeless is arguing, not stating.

/* Caps labels speak in the one platform voice: 11px/500/0.08em on ink-3.
   The old 10px ink-4 row labels were below the contrast floor. */
const CMP_COLHEAD: CSSProperties = {
  textAlign: "start", verticalAlign: "bottom",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
  textTransform: "uppercase", letterSpacing: "0.08em",
  color: "var(--cr-ink-3)", padding: "0 16px 12px",
  borderBottom: "1px solid var(--cr-rule-dark)",
};

const CMP_ROWLABEL: CSSProperties = {
  textAlign: "start", verticalAlign: "top",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
  textTransform: "uppercase", letterSpacing: "0.08em",
  color: "var(--cr-ink-3)", padding: "12px 16px 12px 0",
  borderBottom: "1px solid var(--cr-rule)", whiteSpace: "nowrap",
};

const CMP_CELL: CSSProperties = {
  textAlign: "start", verticalAlign: "top",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
  color: "var(--cr-ink-3)", padding: "12px 16px",
  borderBottom: "1px solid var(--cr-rule)",
};

/** The column that is us. Paper, not a tint: an accent-filled column is the
 *  large accent fill the house reserves for the one primary button. */
const CMP_OURS: CSSProperties = {
  ...CMP_CELL,
  color: "var(--cr-ink-2)",
  background: "var(--cr-paper)",
  borderLeft: "1px solid var(--cr-copper-br)",
  borderRight: "1px solid var(--cr-copper-br)",
};

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
  plan, money, features, annual, isFounding, isInstitution, userType, isCurrent, viewer,
}: {
  plan: FounderPlan | InvestorPlan;
  money: StagePrice;
  features: FeatureRow[];
  annual: boolean;
  isFounding: boolean;
  isInstitution: boolean;
  userType: "founder" | "investor";
  isCurrent?: boolean;
  viewer: PricingViewer | null;
}) {
  const { t } = useTranslation();
  // Renders the fallback until the key lands in every locale.
  const tf = (key: string, fallback: string) => { const out = t(key); return out === key ? fallback : out; };
  const hi = plan.highlightKey !== undefined;
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

  // A member is never routed to sign-up. A card on the other side is for an
  // account type they do not hold, and nobody creates the other side's entity
  // from here. While the founding stage runs, their own side has nothing to
  // sell them: every paywall is already lifted. A member with neither side
  // (an admin, or no role yet) is sent to their own dashboard.
  const signedIn   = viewer !== null;
  const viewerSide = viewer?.role === "startup" ? "founder" : viewer?.role === "investor" ? "investor" : null;
  const otherSide  = signedIn && viewerSide !== null && viewerSide !== userType;
  const noSide     = signedIn && viewerSide === null;
  const included   = signedIn && viewerSide === userType && isFounding && !isInstitution;
  // A member on their own side whose plan was granted (no Stripe customer) has
  // no billing portal to open, so the Free card is not a downgrade they can make.
  const grantedFree = signedIn && viewerSide === userType && free && !viewer?.hasBillingAccount;
  const inert      = !isCurrent && (otherSide || included || grantedFree);
  const fill       = hi && !inert;

  async function openPortal() {
    const res = await fetch("/api/checkout/portal", { method: "POST" });
    const data = await res.json().catch(() => null);
    if (data?.url) window.location.href = data.url;
    else notify.error(t("errors.generic"));
  }

  async function handleClick() {
    // The viewer already has this plan: the only sensible action is managing
    // it, not buying it again. Free current plans have nothing to manage.
    if (isCurrent) {
      if (free) return;
      await openPortal();
      return;
    }
    if (inert) return;
    if (noSide) { window.location.href = dashboardHref(viewer?.role ?? null); return; }
    if (isInstitution) { window.location.href = "/contact?type=institutional"; return; }
    // A member on their own side who does not hold the free plan holds a paid
    // one, so the free card is a change to that subscription, not a sign-up.
    if (signedIn && free) { await openPortal(); return; }

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
    : otherSide
    ? (userType === "founder" ? tf("pricing.forFounderAccounts", "For founder accounts") : tf("pricing.forInvestorAccounts", "For investor accounts"))
    : included || grantedFree
    ? tf("pricing.fullAccessIncluded", "Full access included")
    : noSide
    ? t("hero.ctaDashboard")
    : isInstitution
    ? t("pricing.contactSales")
    : free
      ? (signedIn ? t("dashboard.manageBilling") : t("pricing.getStartedFree"))
      : `${t("pricing.getStarted")} · ${plan.name}`; // house separator, no dash

  return (
    <div className={hi ? "plan-card featured" : "plan-card"}
      style={{
        position: "relative", display: "flex", flexDirection: "column",
        borderRadius: "6px", overflow: "hidden", // 6px: card radius
        border: hi ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule-dark)",
        transition: "border-color 150ms ease",
      }}
      onMouseEnter={e => { if (!hi) (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-paper-4)"; }}
      onMouseLeave={e => { if (!hi) (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; }}>
      {hi && <div style={{ height: "3px", background: "var(--cr-copper)" }} />}

      {/* Chips speak the one caps voice (11/500/0.08em). "Current plan" is a
          statement of fact, not an accent: ink, quiet border. The featured
          badge keeps its copper fill -- it IS the page's accent moment -- so
          its ink is on-accent, not ink-3. */}
      {isCurrent && (
        <div style={{ position: "absolute", top: "16px", right: "16px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "transparent", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", padding: "3px 8px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {t("dashboard.currentPlan")}
          </span>
        </div>
      )}
      {hi && !isCurrent && (
        <div style={{ position: "absolute", top: "16px", right: "16px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--cr-copper)", color: "var(--cr-on-accent)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", padding: "3px 8px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <Zap style={{ width: 10, height: 10 }} /> {t(plan.highlightKey!)}
          </span>
        </div>
      )}

      <div style={{ padding: "24px", display: "flex", flexDirection: "column", flex: 1 }}>
        {/* Plan name: the one caps voice, 11/500/0.08em ink-3. */}
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "16px" }}>{plan.name}</p>

        {/* Card prices sit at 28px, the scale's top step: the page's single
            lead figure is the hero card's, and four 44px figures were four
            competing leads. */}
        <div style={{ marginBottom: "8px" }}>
          {price === null ? (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "28px", color: "var(--cr-ink)", lineHeight: 1, letterSpacing: "-0.04em" }}>{t("common.custom")}</span>
          ) : price === 0 ? (
            // Copper only when the stage is what makes it free -- a plan that
            // is free at every stage is not a discount and must not read as one.
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "28px", color: rising ? "var(--cr-copper)" : "var(--cr-ink)", lineHeight: 1, letterSpacing: "-0.04em" }}>{t("pricing.free")}</span>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px" }}>
              {/* Every card price is ink. The featured card's accent bar and
                  its badge are what own the accent in this band; a copper
                  price under them is a third claim on the same card. */}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "28px", lineHeight: 1, letterSpacing: "-0.04em", color: "var(--cr-ink)" }}>
                {formatMoney(price, PLAN_CURRENCY)}
              </span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "4px" }}>{t("pricing.perMonth")}{annual && yearly ? ` · ${t("pricing.billedYearly", { amount: formatMoney(yearly.total, PLAN_CURRENCY) })}` : ""}</span>
            </div>
          )}
        </div>

        {rising !== null && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "4px" }}>
            {risingParts[0]}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: "var(--cr-ink-3)" }}>{formatMoney(rising, PLAN_CURRENCY)}</span>
            {risingParts[1]}
          </p>
        )}
        {annual && saved > 0 && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", marginBottom: "4px" }}>{t("pricing.saveAnnual", { amount: formatMoney(Math.round(saved), PLAN_CURRENCY) })} · <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{yearly?.percentOff}%</span></p>
        )}

        <div style={{ height: "1px", background: "var(--cr-rule)", margin: "16px 0 24px" }} />

        {/* Feature rows are inventory, not accent: the included-marker dots
            speak ink so the card's one copper moment stays the price/badge. */}
        <ul style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, marginBottom: "24px" }}>
          {features.map((f) => (
            <li key={f.text} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {f.on ? (
                <span style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--cr-rule-dark)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cr-ink-3)" }} />
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

        {/* One filled primary per card row: the featured card only. During
            the founding stage every card used to fill copper, which is four
            primaries and therefore none; siblings hold the quiet outline. A
            button that states a fact rather than acting never fills and
            never answers hover. */}
        <button onClick={handleClick}
          disabled={inert}
          className={fill ? "btn-copper-shimmer" : ""}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", height: "42px", borderRadius: "4px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
            textDecoration: "none", transition: "opacity 150ms", border: "none", cursor: inert ? "default" : "pointer",
            background: fill ? "var(--cr-copper)" : "transparent",
            color: fill ? "var(--cr-on-accent)" : "var(--cr-ink-3)",
            borderColor: fill ? "transparent" : "var(--cr-rule-dark)",
            borderWidth: fill ? 0 : "1px",
            borderStyle: "solid",
          }}
          onMouseEnter={e => {
            if (inert) return;
            if (fill) e.currentTarget.style.opacity = "0.88";
            else { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }
          }}
          onMouseLeave={e => {
            if (inert) return;
            if (fill) e.currentTarget.style.opacity = "1";
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
        {/* The ruled-label class carries the caps voice and the copper bar;
            the label itself stays ink -- the bar is the accent. */}
        <span className="ruled-label">
          {t(pricing.isFounding ? "stage.founding" : "stage.early")}
        </span>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)" }}>
          {pricing.isFounding
            ? t("pricing.stageBannerFounding", { target: pricing.target })
            : t("pricing.stageBannerEarly")}
        </p>
        {pricing.isFounding && (
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "13px", color: "var(--cr-copper)", fontVariantNumeric: "tabular-nums" }}>
              {pricing.memberCount}/{pricing.target}
            </span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {t("pricing.stageMembersLabel")}
            </span>
          </span>
        )}
        <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "11px" }}>✦</span>
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
    <div style={{ borderBottom: "1px solid var(--cr-rule)", padding: "16px 0" }}>
      <button onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "none", border: "none", cursor: "pointer", textAlign: "left", gap: "16px",
        }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: open ? "var(--cr-ink)" : "var(--cr-ink-3)", transition: "color 120ms" }}>{q}</span>
        {/* Disclosure chevron is furniture, not accent: ink. */}
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--cr-ink-4)", fontSize: "13px", flexShrink: 0, transition: "transform 200ms", transform: open ? "rotate(180deg)" : "none", display: "inline-block" }}>▾</span>
      </button>
      {open && (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.7, marginTop: "12px" }}>{a}</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export function PricingClient({ pricing, viewer }: { pricing: StagePricing; viewer: PricingViewer | null }) {
  const { t } = useTranslation();
  // Renders the fallback until the key lands in every locale.
  const tf = (key: string, fallback: string) => { const out = t(key); return out === key ? fallback : out; };
  const [annual,    setAnnual]    = useState(false);
  // The viewer's own side on first paint; the hash below still selects either.
  const [activeTab, setActiveTab] = useState<"startup" | "investor">(viewer?.role === "investor" ? "investor" : "startup");
  // A member's one action wherever an anonymous visitor is offered sign-up.
  const dashboard = viewer ? dashboardHref(viewer.role) : null;
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

  // Who is looking, and what do they already pay for, arrives from the server
  // (app/pricing/page.tsx). Signed-in viewers get their own plan marked and
  // its CTA routed to the billing portal instead of a second checkout.
  useEffect(() => {
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
                {/* Eyebrow speaks in the ruled-label voice itself; the copper
                    bar is the accent, the words stay ink. */}
                <div className="ruled-label" style={{ marginBottom: "24px" }}>
                  {isFounding ? t("pricing.launchPricingLabel") : t("pricing.transparentPricingLabel")}
                </div>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, color: "var(--cr-ink)", fontSize: "clamp(48px,7vw,88px)", lineHeight: 0.9, letterSpacing: "-0.03em", marginBottom: "16px" }}>
                  {isFounding ? (
                    <>{t("pricing.launchHeadlineLine1")}<br />{t("pricing.launchHeadlineLine2", { target })}<br /><span style={{ color: "var(--cr-copper)" }}>{t("pricing.launchHeadlineLine3")}</span></>
                  ) : (
                    <>{t("pricing.headlineLine1")}<br />{t("pricing.headlineLine2")}<br /><span style={{ color: "var(--cr-copper)" }}>{t("pricing.headlineLine3")}</span></>
                  )}
                </h1>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", maxWidth: "360px", lineHeight: 1.7 }}>
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
                {/* The hero launch card: the page's single lead figure lives
                    here (the spots counter while founding, the 2% after).
                    6px: card radius. */}
                <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-copper-br)", borderRadius: "6px", padding: "32px", textAlign: "center" }}>
                  {isFounding ? (
                    <>
                      {/* The card's lead figure reads in ink, in both stages:
                          this band's accent is the accent word in the h1
                          beside it, and a copper counter under a copper icon
                          spends it twice more. The size is a clamp like every
                          other display figure on the page -- a bare 40px sat
                          off the ramp. */}
                      <Sparkles style={{ width: 40, height: 40, color: "var(--cr-ink-3)", margin: "0 auto 8px" }} />
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--cr-ink)", lineHeight: 1, marginBottom: "8px", fontSize: "clamp(28px, 3.5vw, 40px)", letterSpacing: "-0.05em" }}>{Math.max(target - memberCount, 0)}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("pricing.spotsLeftFree")}</p>
                    </>
                  ) : (
                    <>
                      {/* Ink, not foil: the h1 beside this card already holds
                          the band's accent word, and the hero cannot spend it
                          on both. The copper card border is what marks the
                          figure as the offer. */}
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--cr-ink)", lineHeight: 1, marginBottom: "8px", fontSize: "72px", letterSpacing: "-0.05em" }}>2%</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("pricing.successFeeLabel")}</p>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "48px", flexWrap: "wrap" }}>

              {/* The house disclosure device replaces the bespoke switcher:
                  same two audiences, one platform-wide tab voice. */}
              <TabStrip
                tabs={[
                  { key: "startup", label: t("pricing.founders") },
                  { key: "investor", label: t("pricing.investors") },
                ] as const}
                active={activeTab}
                onSelect={setActiveTab}
                idBase="pricing-plans"
                label={t("pricing.founders") + " / " + t("pricing.investors")}
              />

              {/* Annual toggle -- hidden while the stage charges nothing */}
              {bestAnnualDiscount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: !annual ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>{t("pricing.monthly")}</span>
                  {/* 999px: the switch track is a true pill, already round. */}
                  <button onClick={() => setAnnual((a) => !a)}
                    style={{
                      position: "relative", width: "44px", height: "24px", borderRadius: "999px",
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
                    {/* Savings chip: a money fact at the scale floor (11px)
                        and the control radius (4px), in the quiet chip
                        treatment the "Current plan" chip uses. It sits in the
                        same eyeful as the featured card's bar and badge, which
                        are this band's accent. */}
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "11px", color: "var(--cr-ink-2)", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "2px 8px" }}>
                      {t("pricing.saveUpTo", { percent: bestAnnualDiscount })}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* A member is told what they already hold rather than routed to
                sign-up for it. Quiet on purpose: the fee callout below and the
                featured card own this band's accent. */}
            {viewer && isFounding && (
              <p role="note" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "12px 16px", marginBottom: "16px" }}>
                {tf("pricing.memberFullAccess", "You already have full access while the founding stage runs.")}
              </p>
            )}

            {/* 2% success fee callout */}
            <div style={{
              display: "flex", alignItems: "center", gap: "16px",
              background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)",
              borderRadius: "6px", padding: "16px", marginBottom: "24px", // 6px: panel radius
            }}>
              <div style={{
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                width: "40px", height: "40px",
                background: "var(--cr-copper-bg)", borderRadius: "4px",
                border: "1px solid var(--cr-copper-br)",
              }}>
                {/* The tinted panel is what marks this note; the numeral in it
                    reads in ink, so the band's accent stays with the featured
                    card's bar and badge. */}
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "13px", color: "var(--cr-ink)", letterSpacing: "-0.03em" }}>2%</span>
              </div>
              <div>
                {activeTab === "startup" ? (
                  <>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "2px" }}>
                      {t("pricing.oneSuccessFeeTitle")}
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>
                      {t("pricing.founderFeeBody").split("{bold}")[0]}
                      <strong style={{ fontWeight: 600, color: "var(--cr-ink)" }}>{t("pricing.founderFeeBodyBold")}</strong>
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
                      <strong style={{ fontWeight: 600, color: "var(--cr-ink)" }}>{t("pricing.investorFeeBodyBold")}</strong>
                      {t("pricing.investorFeeBody").split("{bold}")[1]}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* TabPanel carries the ids the strip's aria-controls promises,
                plus the shared crossfade between audiences. */}
            <TabPanel idBase="pricing-plans" active={activeTab}>
              {activeTab === "startup" ? (
                <>
                  <div className="grid-plans-3" style={{ maxWidth: "900px", marginBottom: "24px" }}>
                    {FOUNDER_PLANS_LIST.map((p) => (
                      <PlanCard key={p.id} plan={p} money={pricing.founder[p.id]} features={founderFeatureRows(p, t)} annual={annual} isFounding={isFounding} isInstitution={false} userType="founder" isCurrent={currentTabForViewer === "startup" && currentPlanId === p.id} viewer={viewer} />
                    ))}
                  </div>
                  <PlanComparison side="founder" isLaunch={isFounding} />
                </>
              ) : (
                <>
                  <div className="grid-plans-4" style={{ marginBottom: "24px" }}>
                    {INVESTOR_PLANS_LIST.map((p) => (
                      <PlanCard key={p.id} plan={p} money={pricing.investor[p.id]} features={investorFeatureRows(p, t)} annual={annual} isFounding={isFounding} isInstitution={p.id === "institution"} userType="investor" isCurrent={currentTabForViewer === "investor" && currentPlanId === p.id} viewer={viewer} />
                    ))}
                  </div>
                  <PlanComparison side="investor" isLaunch={isFounding} />
                </>
              )}
            </TabPanel>

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
              {/* Eyebrow in the ruled-label voice; the bar carries the accent. */}
              <div className="ruled-label" style={{ marginBottom: "16px" }}>
                {t("pricing.modelEyebrow")}
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, color: "var(--cr-ink)", fontSize: "clamp(32px,4vw,52px)", lineHeight: 0.93, letterSpacing: "-0.03em", maxWidth: "480px" }}>
                {t("pricing.winHeadline")}
              </h2>
            </div>

            {/* A three-way comparison that reflows to two columns and one has
                stopped comparing, so this holds its shape at every width and
                scrolls inside its own box on a phone rather than putting a
                sideways scroll on the page. */}
            <div style={{ overflowX: "auto", marginBottom: "48px" }}>
              <table style={{ width: "100%", minWidth: "620px", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...CMP_COLHEAD, width: "24%", padding: "0 16px 12px 0" }} />
                    <th scope="col" style={CMP_COLHEAD}>{t("pricing.colTraditional")}</th>
                    <th scope="col" style={{
                      ...CMP_COLHEAD,
                      color: "var(--cr-copper)", background: "var(--cr-paper)",
                      borderTop: "2px solid var(--cr-copper)",
                      borderLeft: "1px solid var(--cr-copper-br)",
                      borderRight: "1px solid var(--cr-copper-br)",
                      borderBottom: "1px solid var(--cr-copper-br)",
                      padding: "12px 16px",
                    }}>
                      CapitalReach
                    </th>
                    <th scope="col" style={CMP_COLHEAD}>{t("pricing.colDiy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* The fee row sets its figures in mono and its qualifier in
                      prose: the house never lets running text carry a number,
                      and the broker benchmark is a typical figure rather than a
                      surveyed one, so the cell says so beside it. */}
                  <tr>
                    <th scope="row" style={CMP_ROWLABEL}>{t("pricing.cmpRowFee")}</th>
                    <td style={CMP_CELL}>
                      <span style={{ display: "inline-flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", fontVariantNumeric: "tabular-nums", color: "var(--cr-ink)" }}>{BROKER_BENCHMARK_PERCENT}%</span>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{t("pricing.cmpTypical")}</span>
                      </span>
                    </td>
                    <td style={CMP_OURS}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", fontVariantNumeric: "tabular-nums", color: "var(--cr-copper)" }}>{SUCCESS_FEE_PERCENT}%</span>
                    </td>
                    <td style={CMP_CELL}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", fontVariantNumeric: "tabular-nums", color: "var(--cr-ink)" }}>0%</span>
                    </td>
                  </tr>
                  {[
                    { key: "PaidBy",   label: t("pricing.cmpRowPaidBy") },
                    { key: "Upfront",  label: t("pricing.cmpRowUpfront") },
                    { key: "Ongoing",  label: t("pricing.cmpRowOngoing") },
                    { key: "Intros",   label: t("pricing.cmpRowIntros") },
                    { key: "Tracking", label: t("pricing.cmpRowTracking") },
                  ].map((row) => (
                    <tr key={row.key}>
                      <th scope="row" style={CMP_ROWLABEL}>{row.label}</th>
                      <td style={CMP_CELL}>{t(`pricing.cmpTrad${row.key}`)}</td>
                      <td style={CMP_OURS}>{t(`pricing.cmpCr${row.key}`)}</td>
                      <td style={CMP_CELL}>{t(`pricing.cmpDiy${row.key}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Interactive 2% calculator (Phase 1, mechanism D): the same
                comparison as the columns above, but on the reader's own number.
                Lifted from the band's tint to paper with a 2px ink overline,
                so the model band stays the page's one slab and the calculator
                reads as a worksheet laid on it. */}
            <div className="grid-plans-3" style={{ marginBottom: "32px", alignItems: "start" }}>
              <div style={{ gridColumn: "1 / -1", maxWidth: "560px" }}>
                <FeeCalculator
                  variant="raise" currency="EUR" defaultAmount={500_000} titleKey="feeCalc.titleCompare"
                  style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule)", borderTop: "2px solid var(--cr-ink)" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {dashboard ? (
                <Link href={dashboard}
                  className="btn-copper-shimmer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "var(--cr-on-accent)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "0 24px", height: "44px", borderRadius: "4px", textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                  {t("hero.ctaDashboard")} <ArrowRight style={{ width: 14, height: 14 }} />
                </Link>
              ) : (
                <>
                  <Link href="/auth/signup"
                    className="btn-copper-shimmer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "var(--cr-on-accent)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "0 24px", height: "44px", borderRadius: "4px", textDecoration: "none" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                    {t("hero.ctaPrimary")} <ArrowRight style={{ width: 14, height: 14 }} />
                  </Link>
                  <Link href="/auth/signup"
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", padding: "0 24px", height: "44px", borderRadius: "4px", textDecoration: "none", background: "var(--cr-paper)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)"; }}>
                    {t("pricing.browseAsInvestor")}
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        {/* AI report callout */}
        <section style={{ padding: "48px 0", borderTop: "1px solid var(--cr-rule)" }}>
          <div className="max-w-[1200px] mx-auto px-6 md:px-10">
            {/* flexWrap: three fixed-width flex children overflowed a 375px
                screen by 23px and put a sideways scroll on the whole page. */}
            <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", padding: "24px", display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap", transition: "border-color 150ms" }}
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
                FAQ
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
            <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "6px", overflow: "hidden", position: "relative" }}>
              <div style={{ height: "3px", background: "var(--cr-copper)" }} />
              <div style={{ padding: "64px 24px", textAlign: "center" }}>
                {/* The launch story is told ONCE, by the hero card with the
                    spots counter. This close keeps a single launch sentence
                    (the sub below, while founding) and drops the repeated
                    "limited spots" eyebrow. */}
                <div className="ruled-label" style={{ justifyContent: "center", marginBottom: "24px" }}>
                  {t("pricing.earlyAccess")}
                </div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, color: "var(--cr-ink)", fontSize: "clamp(32px,4.5vw,60px)", lineHeight: 0.93, letterSpacing: "-0.03em", maxWidth: "560px", margin: "0 auto 16px" }}>
                  {t("pricing.ctaHeadline")}
                </h2>
                {/* Both subs invite the reader to join. A member already has,
                    and during the founding stage the plans band has already
                    told them what they hold, so they get the action alone. */}
                {!viewer && (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", maxWidth: "360px", margin: "0 auto 32px", lineHeight: 1.7 }}>
                    {isFounding
                      ? t("pricing.finalCtaLaunchSub", { target })
                      : t("pricing.finalCtaSub")}
                  </p>
                )}
                <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: viewer ? "32px" : 0 }}>
                  {dashboard ? (
                    <Link href={dashboard}
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "var(--cr-on-accent)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px", padding: "0 32px", height: "48px", borderRadius: "4px", textDecoration: "none" }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                      {t("hero.ctaDashboard")} <ArrowRight style={{ width: 14, height: 14 }} />
                    </Link>
                  ) : (
                    <>
                      <Link href="/auth/signup"
                        style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "var(--cr-on-accent)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px", padding: "0 32px", height: "48px", borderRadius: "4px", textDecoration: "none" }}
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
                    </>
                  )}
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
