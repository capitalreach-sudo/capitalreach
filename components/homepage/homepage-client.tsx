"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReveal } from "@/hooks/useReveal";
import { useCountUp } from "@/hooks/useCountUp";
import { formatCurrency, formatGrowth } from "@/lib/format";
import { FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST } from "@/lib/plans";
import type { PlatformStats } from "@/lib/stats";
import type { HeroStartup, ListingSnippet } from "@/app/page";

// ── Primitives ────────────────────────────────────────────────

function ScoreRing({ score }: { score: number | null }) {
  const size = 52;
  const sw   = 4;
  const r    = size / 2 - sw;
  const c    = size / 2;
  const circ = 2 * Math.PI * r;

  if (score === null) {
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#D8D0C4" strokeWidth={sw}
            strokeLinecap="square" strokeDasharray="4 6" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "#9C8E82" }}>—</span>
        </div>
      </div>
    );
  }

  const dash = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#D8D0C4" strokeWidth={sw} strokeLinecap="square" />
        <circle cx={c} cy={c} r={r} fill="none" stroke="#B5651D" strokeWidth={sw}
          strokeLinecap="square" strokeDasharray={`${dash} ${circ}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "#B5651D", lineHeight: 1 }}>
          {score}
        </span>
      </div>
    </div>
  );
}

function DiamondDot() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 0L6 3L3 6L0 3L3 0Z" fill="#B5651D" />
    </svg>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span style={{
      background: "#EDE8DE", border: "1px solid #D8D0C4", borderRadius: "3px",
      padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
      fontSize: "11px", color: "#6B6056", textTransform: "uppercase", letterSpacing: "0.06em",
      whiteSpace: "nowrap",
    }}>
      {stage}
    </span>
  );
}

// ── Hero Card ────────────────────────────────────────────────

function HeroCard({ startup }: { startup: HeroStartup }) {
  const metrics = [
    { label: "MRR",        value: startup.mrr        != null ? formatCurrency(startup.mrr)           : "—" },
    { label: "ARR",        value: startup.arr        != null ? formatCurrency(startup.arr)           : "—" },
    { label: "Growth MoM", value: startup.growth_mom != null ? formatGrowth(startup.growth_mom).text : "—" },
    { label: "Runway",     value: startup.runway     != null ? `${startup.runway}mo`                 : "—" },
  ];

  return (
    <div style={{ width: "100%", border: "1px solid #D8D0C4", borderRadius: "6px", overflow: "hidden", background: "#EDE8DE" }}>

      {/* Top strip */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px", background: "#EDE8DE",
        borderBottom: "1px solid #D8D0C4",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "4px", background: "#E4DDD2",
            border: "1px solid #D8D0C4", display: "flex", alignItems: "center",
            justifyContent: "center", overflow: "hidden", flexShrink: 0,
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "16px", color: "#B5651D",
          }}>
            {startup.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={startup.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : startup.name.charAt(0)
            }
          </div>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "#1A1612" }}>{startup.name}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "#9C8E82", marginTop: "2px" }}>{startup.industry}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
          <ScoreRing score={startup.vaultrise_score} />
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "9px", fontWeight: 500, color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            AI Score
          </div>
        </div>
      </div>

      {/* Metrics area — paper (lightest) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "#D8D0C4" }}>
        {metrics.map(({ label, value }) => (
          <div key={label} style={{ padding: "12px 14px", background: "#F5F0E8" }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>{label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "20px", color: "#1A1612", lineHeight: 1.1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Bottom strip — paper-3 (darkest) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "#E4DDD2", borderTop: "1px solid #D8D0C4" }}>
        <div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>Raising</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "20px", color: "#B5651D", lineHeight: 1.1 }}>{formatCurrency(startup.funding_target)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          <StageBadge stage={startup.stage} />
          <Link href={`/startups/${startup.slug}`}
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "#B5651D", textDecoration: "none" }}>
            View deal →
          </Link>
        </div>
      </div>
    </div>
  );
}

function HeroCardPlaceholder() {
  return (
    <div style={{ width: "100%", background: "#EDE8DE", border: "1px solid #D8D0C4", borderRadius: "6px", padding: "60px 40px", textAlign: "center" }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "#9C8E82", lineHeight: 1.7 }}>
        Be among the first vetted listings.<br />
        <Link href="/auth/signup?role=startup" style={{ color: "#B5651D", textDecoration: "none" }}>Apply to list →</Link>
      </p>
    </div>
  );
}

// ── Static data ───────────────────────────────────────────────

const AI_TOOLS = [
  { num: "01", name: "AI Pitch Scorer",  href: "/ai#score",        desc: "Upload your deck and financials. Our model evaluates team, traction, market size, and narrative — returning a 0–100 score with a full breakdown.", cta: "Score your pitch →" },
  { num: "02", name: "Smart Matching",   href: "/ai#match",         desc: "State your thesis, geography, and cheque size. AI surfaces listings most aligned to your strategy — ranked by fit, not recency.", cta: "Find matches →" },
  { num: "03", name: "Due Diligence AI", href: "/ai#due-diligence", desc: "Request an AI-generated due diligence report on any listing. Covers financials, competition, risks, and key questions — in minutes.", cta: "Run due diligence →" },
] as const;

const FOUNDER_FEATURES: { feature: string; values: [string, string, string] }[] = [
  { feature: "Startup listings",   values: ["1", "1", "Unlimited"] },
  { feature: "AI pitch score",     values: ["—", "✓", "✓"] },
  { feature: "NDA documents",      values: ["—", "✓", "✓"] },
  { feature: "Deal pipeline",      values: ["—", "✓", "✓"] },
  { feature: "Analytics",          values: ["—", "—", "✓"] },
  { feature: "Featured placement", values: ["—", "—", "✓"] },
  { feature: "Priority review",    values: ["—", "✓", "✓"] },
];

const INVESTOR_FEATURES: { feature: string; values: [string, string, string] }[] = [
  { feature: "Browse listings",   values: ["✓", "✓",          "✓"] },
  { feature: "Full financials",   values: ["—", "✓",          "✓"] },
  { feature: "Founder messaging", values: ["—", "✓",          "✓"] },
  { feature: "AI due diligence",  values: ["—", "$29/report", "Included"] },
  { feature: "AI smart matching", values: ["—", "—",          "✓"] },
  { feature: "Data export",       values: ["—", "—",          "✓"] },
];

const FOUNDER_STEPS: [string, string, string][] = [
  ["01", "Create your listing",  "Complete your profile, upload your pitch deck, add financials, and answer key investor questions."],
  ["02", "Get AI scored",        "Our model evaluates your deck, financials, and team — returning a 0–100 score with a full breakdown."],
  ["03", "Match with investors", "Investors browse and filter by score, stage, and sector. Matched investors see your full listing."],
  ["04", "Close your round",     "Use our pipeline tools to track conversations, share NDAs, and close with confidence."],
];

const INVESTOR_STEPS: [string, string, string][] = [
  ["01", "Browse vetted listings", "Every startup is approved before going live. No spam, no unvetted pitches, no wasted time."],
  ["02", "Apply AI filters",       "Filter by score, stage, sector, and MRR. Let AI rank matches by your investment thesis."],
  ["03", "Request full access",    "Unlock financials and NDA-gated documents in one click."],
  ["04", "Track your pipeline",    "Manage conversations, notes, and terms from a unified investment dashboard."],
];

// ── Main Component ────────────────────────────────────────────

interface Props {
  stats:       PlatformStats;
  heroStartup: HeroStartup | null;
  listings:    ListingSnippet[];
}

export function HomepageClient({ stats, heroStartup, listings }: Props) {
  const [pricingTab, setPricingTab] = useState<"founder" | "investor">("founder");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const router = useRouter();

  // Count-up hooks — always called, filtered before render
  const suCU = useCountUp(stats.startupCount,     1200);
  const iuCU = useCountUp(stats.investorCount,    1200);
  const duCU = useCountUp(stats.dealsClosedCount, 1200);
  const ruCU = useCountUp(stats.totalRaised,      1200);

  // Reveal hook — listings section
  const listRef = useReveal();

  // Stagger reveal — how it works
  const [howVisible, setHowVisible] = useState(false);
  const howRef = useRef<HTMLElement>(null);

  // Stagger reveal — AI tools
  const [aiVisible, setAiVisible] = useState(false);
  const aiRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sections: [React.RefObject<HTMLElement>, React.Dispatch<React.SetStateAction<boolean>>][] = [
      [howRef, setHowVisible],
      [aiRef,  setAiVisible],
    ];
    const observers = sections.map(([ref, setter]) => {
      const el = ref.current;
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([e]) => { if (e.isIntersecting) { setter(true); obs.unobserve(e.target); } },
        { threshold: 0.1 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, []);

  // Stats — filter zeros, build display items
  const statsItems = [
    { label: "Startups listed",    raw: stats.startupCount,     ref: suCU.ref, display: suCU.value.toLocaleString() },
    { label: "Verified investors", raw: stats.investorCount,    ref: iuCU.ref, display: iuCU.value.toLocaleString() },
    { label: "Deals closed",       raw: stats.dealsClosedCount, ref: duCU.ref, display: duCU.value.toLocaleString() },
    { label: "Capital raised",     raw: stats.totalRaised,      ref: ruCU.ref, display: formatCurrency(ruCU.value) },
  ].filter(s => s.raw > 0);
  const showStats = statsItems.length > 0;

  // Trust indicators — filter zeros
  const trustItems: [number, string][] = [
    [stats.startupCount,     "startups listed"],
    [stats.investorCount,    "verified investors"],
    [stats.dealsClosedCount, "deals closed"],
  ];

  // Pricing
  const isFounder       = pricingTab === "founder";
  const pricingPlans    = isFounder ? FOUNDER_PLANS_LIST.slice(0, 3) : INVESTOR_PLANS_LIST.slice(0, 3);
  const pricingFeatures = isFounder ? FOUNDER_FEATURES : INVESTOR_FEATURES;

  return (
    <main style={{ background: "#F5F0E8" }}>

      {/* ── HERO ── */}
      <section style={{ background: "#F5F0E8" }} className="min-h-[calc(100svh-56px)] flex items-center">
        <div className="max-w-[1200px] mx-auto w-full px-6 md:px-10 grid grid-cols-1 md:grid-cols-[55fr_45fr] gap-10 md:gap-16 py-16 md:py-0">

          {/* Left column */}
          <div className="flex flex-col justify-center">
            <div className="ruled-label" style={{ marginBottom: "40px" }}>Private Capital · Est. 2024</div>

            <h1 style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(36px, 8vw, 72px)",
              color:         "#1A1612",
              lineHeight:    0.95,
              letterSpacing: "-0.02em",
              marginBottom:  "24px",
            }}>
              Where serious<br />
              capital meets<br />
              <span style={{ color: "#B5651D" }}>vetted ventures.</span>
            </h1>

            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize:   "17px",
              color:      "#6B6056",
              lineHeight: 1.7,
              maxWidth:   "420px",
            }}>
              A private marketplace for founders raising capital and investors deploying it.
              Every listing is vetted. Every number is real. 2% fee — only after you close.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "40px", flexWrap: "wrap" }}>
              <Link href="/auth/signup?role=startup" style={{ textDecoration: "none" }}>
                <button
                  style={{ background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "13px 28px", borderRadius: "4px", border: "none", cursor: "pointer", transition: "background 120ms ease" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#D4842A")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#B5651D")}
                >
                  List your startup
                </button>
              </Link>
              <Link href="/startups" style={{ textDecoration: "none" }}>
                <button
                  style={{ background: "transparent", color: "#1A1612", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "15px", padding: "12px 28px", borderRadius: "4px", border: "1px solid #D8D0C4", cursor: "pointer", transition: "border-color 120ms ease" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#9C8E82")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#D8D0C4")}
                >
                  Browse listings →
                </button>
              </Link>
            </div>

            {/* Trust indicators */}
            {trustItems.some(([v]) => v > 0) && (
              <div style={{ display: "flex", alignItems: "center", gap: "24px", marginTop: "32px", flexWrap: "wrap" }}>
                {trustItems.filter(([v]) => v > 0).map(([v, label]) => (
                  <div key={label} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <DiamondDot />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#6B6056" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: "#3D3630" }}>{v.toLocaleString()}</span>{" "}{label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex items-center mt-10 md:mt-0">
            {heroStartup ? <HeroCard startup={heroStartup} /> : <HeroCardPlaceholder />}
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      {showStats && (
        <div
          className="h-[72px] flex items-center"
          style={{ background: "#EDE8DE", borderTop: "1px solid rgba(26,22,18,0.1)", borderBottom: "1px solid rgba(26,22,18,0.1)" }}
        >
          <div className="max-w-[1200px] mx-auto w-full h-full px-6 md:px-10">
            <div
              className="grid h-full"
              style={{ gridTemplateColumns: `repeat(${statsItems.length}, 1fr)` }}
            >
              {statsItems.map((item, i) => {
                const isLast = i === statsItems.length - 1;
                return (
                  <div
                    key={item.label}
                    ref={item.ref as React.RefObject<HTMLDivElement>}
                    className="flex flex-col justify-center items-center"
                    style={{
                      borderRight: !isLast ? "1px solid rgba(26,22,18,0.1)" : undefined,
                    }}
                  >
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "28px", color: "#1A1612", lineHeight: 1 }}>
                      {item.display}
                    </div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "4px" }}>
                      {item.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── LISTINGS TABLE ── */}
      <section
        ref={listRef as React.RefObject<HTMLElement>}
        className="reveal"
        style={{ background: "#F5F0E8", borderBottom: "1px solid rgba(26,22,18,0.1)" }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
            <div className="ruled-label">Featured listings</div>
            <Link href="/startups" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "#B5651D", textDecoration: "none" }}>View all →</Link>
          </div>

          {/* Header row */}
          <div
            className="hidden md:flex items-center"
            style={{ paddingBottom: "12px", borderBottom: "1px solid rgba(26,22,18,0.2)" }}
          >
            <div style={{ flex: 1, minWidth: "200px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>Company</div>
            <div style={{ minWidth: "120px", maxWidth: "120px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>Industry</div>
            <div style={{ minWidth: "100px", maxWidth: "100px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>Stage</div>
            <div style={{ minWidth: "90px", textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>MRR</div>
            <div style={{ minWidth: "100px", textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>Raising</div>
            <div style={{ minWidth: "64px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>Score</div>
            <div style={{ minWidth: "48px", textAlign: "right" }} />
          </div>

          {/* Mobile header */}
          <div
            className="flex md:hidden items-center"
            style={{ paddingBottom: "12px", borderBottom: "1px solid rgba(26,22,18,0.2)" }}
          >
            <div style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>Company</div>
            <div style={{ minWidth: "80px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>Stage</div>
            <div style={{ minWidth: "90px", textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>Raising</div>
            <div style={{ minWidth: "36px" }} />
          </div>

          {listings.length === 0 ? (
            <div style={{ paddingTop: "32px", textAlign: "center" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "#9C8E82", marginBottom: "16px" }}>
                No active listings yet. Be the first to list your startup.
              </p>
              <Link href="/auth/signup?role=startup">
                <button style={{ background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", padding: "10px 20px", borderRadius: "4px", border: "none", cursor: "pointer" }}>
                  List now →
                </button>
              </Link>
            </div>
          ) : (
            listings.map((s) => {
              const isHovered = hoveredRow === s.id;
              return (
                <div
                  key={s.id}
                  className="flex items-center h-[56px]"
                  onClick={() => router.push(`/startups/${s.slug}`)}
                  onMouseEnter={() => setHoveredRow(s.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    borderBottom: "1px solid rgba(26,22,18,0.08)",
                    background: isHovered ? "#E4DDD2" : "transparent",
                    transition: "background 120ms ease",
                    cursor: "pointer",
                  }}
                >
                  {/* Logo + Name */}
                  <div style={{ flex: 1, minWidth: "200px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", background: "#E4DDD2",
                      border: "1px solid #D8D0C4", display: "flex", alignItems: "center",
                      justifyContent: "center", overflow: "hidden", flexShrink: 0,
                      fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "#B5651D",
                    }}>
                      {s.logo_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={s.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : s.name.charAt(0)
                      }
                    </div>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#1A1612" }}>{s.name}</span>
                  </div>

                  {/* Industry — desktop only */}
                  <div
                    className="hidden md:block"
                    style={{ minWidth: "120px", maxWidth: "120px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#6B6056", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {s.industry}
                  </div>

                  {/* Stage */}
                  <div style={{ minWidth: "100px", maxWidth: "100px" }}><StageBadge stage={s.stage} /></div>

                  {/* MRR — desktop only */}
                  <div
                    className="hidden md:block"
                    style={{ minWidth: "90px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px", color: "#3D3630" }}
                  >
                    {s.mrr != null ? formatCurrency(s.mrr) : "—"}
                  </div>

                  {/* Raising */}
                  <div style={{ minWidth: "100px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "#B5651D" }}>
                    {formatCurrency(s.funding_target)}
                  </div>

                  {/* AI Score — desktop only */}
                  <div className="hidden md:flex justify-center" style={{ minWidth: "64px" }}>
                    {s.vaultrise_score != null ? (
                      <span style={{ display: "inline-block", background: "rgba(181,101,29,0.06)", border: "1px solid rgba(181,101,29,0.2)", borderRadius: "3px", padding: "2px 8px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "#B5651D" }}>
                        {s.vaultrise_score}
                      </span>
                    ) : (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: "#9C8E82" }}>—</span>
                    )}
                  </div>

                  {/* View arrow */}
                  <div style={{ minWidth: "48px", textAlign: "right" }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: isHovered ? "#1A1612" : "#9C8E82", transition: "color 120ms ease" }}>
                      View →
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        ref={howRef}
        style={{ background: "#EDE8DE", borderBottom: "1px solid rgba(26,22,18,0.1)" }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20">
          <div className="ruled-label" style={{ marginBottom: "48px" }}>How it works</div>

          <div className="flex flex-col md:flex-row">
            {/* Founders column */}
            <div className="flex-1 md:pr-12 md:border-r pb-10 md:pb-0" style={{ borderColor: "rgba(26,22,18,0.12)" }}>
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "#1A1612", marginBottom: "32px" }}>For Founders</h3>
              {FOUNDER_STEPS.map(([num, title, desc], i) => (
                <div
                  key={num}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "16px",
                    marginBottom: i < FOUNDER_STEPS.length - 1 ? "28px" : 0,
                    opacity: howVisible ? 1 : 0,
                    transform: howVisible ? "none" : "translateY(12px)",
                    transition: `opacity 500ms ease ${i * 80}ms, transform 500ms ease ${i * 80}ms`,
                  }}
                >
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "#9C8E82", minWidth: "24px", flexShrink: 0, lineHeight: "1.4" }}>{num}</div>
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "15px", color: "#1A1612", marginBottom: "4px" }}>{title}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#6B6056", lineHeight: 1.55 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Investors column */}
            <div className="flex-1 md:pl-12 pt-10 md:pt-0" style={{ borderTop: "1px solid rgba(26,22,18,0.12)" }}>
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "#1A1612", marginBottom: "32px", marginTop: "0" }}>For Investors</h3>
              {INVESTOR_STEPS.map(([num, title, desc], i) => (
                <div
                  key={num}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "16px",
                    marginBottom: i < INVESTOR_STEPS.length - 1 ? "28px" : 0,
                    opacity: howVisible ? 1 : 0,
                    transform: howVisible ? "none" : "translateY(12px)",
                    transition: `opacity 500ms ease ${i * 80 + 40}ms, transform 500ms ease ${i * 80 + 40}ms`,
                  }}
                >
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "#9C8E82", minWidth: "24px", flexShrink: 0, lineHeight: "1.4" }}>{num}</div>
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "15px", color: "#1A1612", marginBottom: "4px" }}>{title}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#6B6056", lineHeight: 1.55 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── AI TOOLS ── */}
      <section
        ref={aiRef}
        style={{ background: "#F5F0E8", borderBottom: "1px solid rgba(26,22,18,0.1)" }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20">
          <div className="ruled-label" style={{ marginBottom: "48px" }}>AI-powered analysis</div>

          <div className="flex flex-col md:flex-row">
            {AI_TOOLS.map((tool, i) => (
              <div
                key={tool.name}
                className={[
                  "flex-1",
                  i < 2 ? "md:border-r md:pr-10" : "md:pl-10",
                  i === 1 ? "md:px-10" : "",
                  i < 2 ? "pb-10 md:pb-0 border-b md:border-b-0" : "",
                ].join(" ")}
                style={{
                  borderColor: "rgba(26,22,18,0.12)",
                  opacity:   aiVisible ? 1 : 0,
                  transform: aiVisible ? "none" : "translateY(12px)",
                  transition: `opacity 500ms ease ${i * 100}ms, transform 500ms ease ${i * 100}ms`,
                }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "11px", color: "#9C8E82", marginBottom: "16px" }}>{tool.num}</div>
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "22px", color: "#1A1612", lineHeight: 1.1, marginBottom: "12px" }}>{tool.name}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "#6B6056", lineHeight: 1.65, marginBottom: "24px" }}>{tool.desc}</p>
                <a
                  href={tool.href}
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "#B5651D", textDecoration: "none" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.textDecoration = "underline")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.textDecoration = "none")}
                >
                  {tool.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ── */}
      <section style={{ background: "#EDE8DE", borderBottom: "1px solid rgba(26,22,18,0.1)" }}>
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20">

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "48px", flexWrap: "wrap", gap: "16px" }}>
            <div className="ruled-label">Plans &amp; pricing</div>
            {/* Toggle */}
            <div style={{ display: "flex", borderBottom: "2px solid rgba(26,22,18,0.1)" }}>
              {(["founder", "investor"] as const).map((tab) => {
                const active = pricingTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setPricingTab(tab)}
                    style={{
                      background:    "transparent",
                      border:        "none",
                      borderBottom:  active ? "2px solid #B5651D" : "2px solid transparent",
                      marginBottom:  "-2px",
                      cursor:        "pointer",
                      padding:       "0 24px 12px 0",
                      fontFamily:    "'DM Sans', sans-serif",
                      fontWeight:    500,
                      fontSize:      "14px",
                      color:         active ? "#1A1612" : "#9C8E82",
                      transition:    "color 150ms ease",
                    }}
                  >
                    {tab === "founder" ? "Founders" : "Investors"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block" style={{ border: "1px solid rgba(26,22,18,0.15)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ minWidth: "200px" }} />
                {pricingPlans.map((_, i) => <col key={i} />)}
              </colgroup>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(26,22,18,0.2)" }}>
                  <th style={{ padding: "16px 20px 12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.08em" }}>Feature</th>
                  {pricingPlans.map((plan, i) => {
                    const featured = i === 1;
                    return (
                      <th key={plan.id} style={{
                        padding: "16px 20px 12px", textAlign: "center",
                        background: featured ? "rgba(181,101,29,0.05)" : "transparent",
                        borderLeft: featured ? "1px solid rgba(181,101,29,0.2)" : "1px solid rgba(26,22,18,0.1)",
                        borderRight: featured ? "1px solid rgba(181,101,29,0.2)" : "none",
                      }}>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: featured ? "#B5651D" : "#1A1612" }}>{plan.name}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "22px", color: featured ? "#B5651D" : "#1A1612", marginTop: "4px", lineHeight: 1 }}>
                          {plan.price === 0
                            ? "Free"
                            : <>{`$${plan.price}`}<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#9C8E82" }}>/mo</span></>
                          }
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pricingFeatures.map(({ feature, values }, rowIdx) => (
                  <tr key={feature} style={{ background: rowIdx % 2 === 0 ? "rgba(26,22,18,0.03)" : "transparent", borderBottom: "1px solid rgba(26,22,18,0.08)" }}>
                    <td style={{ padding: "11px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "#1A1612" }}>{feature}</td>
                    {values.map((v, i) => {
                      const isCheck = v === "✓";
                      const isDash  = v === "—";
                      const featured = i === 1;
                      return (
                        <td key={i} style={{
                          padding: "11px 20px", textAlign: "center",
                          fontFamily: isCheck || isDash ? "'DM Sans', sans-serif" : "'JetBrains Mono', monospace",
                          fontWeight: isCheck ? 500 : isDash ? 300 : 500,
                          fontSize: "14px",
                          color: isCheck ? "#2D6A4F" : isDash ? "#9C8E82" : "#3D3630",
                          background: featured ? "rgba(181,101,29,0.05)" : "transparent",
                          borderLeft: featured ? "1px solid rgba(181,101,29,0.2)" : "1px solid rgba(26,22,18,0.08)",
                          borderRight: featured ? "1px solid rgba(181,101,29,0.2)" : "none",
                        }}>
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "16px 20px" }} />
                  {pricingPlans.map((plan, i) => {
                    const featured = i === 1;
                    return (
                      <td key={plan.id} style={{
                        padding: "16px 20px", textAlign: "center",
                        background: featured ? "rgba(181,101,29,0.05)" : "transparent",
                        borderLeft: featured ? "1px solid rgba(181,101,29,0.2)" : "1px solid rgba(26,22,18,0.08)",
                        borderRight: featured ? "1px solid rgba(181,101,29,0.2)" : "none",
                      }}>
                        <Link href={`/pricing#${isFounder ? "founders" : "investors"}`} style={{ textDecoration: "none" }}>
                          <button style={{
                            background: featured ? "#B5651D" : "transparent",
                            color: featured ? "#fff" : "#6B6056",
                            fontFamily: "'DM Sans', sans-serif",
                            fontWeight: featured ? 600 : 400,
                            fontSize: "13px", padding: "9px 20px", borderRadius: "4px",
                            border: featured ? "none" : "1px solid #D8D0C4",
                            cursor: "pointer", width: "100%",
                          }}>
                            {plan.price === 0 ? "Get started free" : "Get started"}
                          </button>
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-4">
            {pricingPlans.map((plan, i) => {
              const featured = i === 1;
              return (
                <div key={plan.id} style={{
                  background: "#F5F0E8",
                  border: `1px solid ${featured ? "rgba(181,101,29,0.4)" : "#D8D0C4"}`,
                  borderRadius: "6px", padding: "20px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "#1A1612" }}>{plan.name}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "22px", color: featured ? "#B5651D" : "#1A1612", marginTop: "4px", lineHeight: 1 }}>
                        {plan.price === 0 ? "Free" : `$${plan.price}`}
                        {plan.price > 0 && <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#9C8E82" }}>/mo</span>}
                      </div>
                    </div>
                    {featured && <span style={{ background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", padding: "3px 8px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Popular</span>}
                  </div>
                  {pricingFeatures.map(({ feature, values }) => {
                    const v = values[i];
                    const isCheck = v === "✓";
                    const isDash  = v === "—";
                    return (
                      <div key={feature} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(26,22,18,0.06)" }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "#1A1612" }}>{feature}</span>
                        <span style={{ fontFamily: isCheck || isDash ? "'DM Sans', sans-serif" : "'JetBrains Mono', monospace", fontWeight: isCheck ? 500 : 300, fontSize: "13px", color: isCheck ? "#2D6A4F" : isDash ? "#9C8E82" : "#3D3630" }}>{v}</span>
                      </div>
                    );
                  })}
                  <Link href={`/pricing`} style={{ textDecoration: "none", display: "block", marginTop: "16px" }}>
                    <button style={{ width: "100%", height: "40px", background: featured ? "#B5651D" : "transparent", color: featured ? "#fff" : "#6B6056", fontFamily: "'DM Sans', sans-serif", fontWeight: featured ? 600 : 400, fontSize: "13px", borderRadius: "4px", border: featured ? "none" : "1px solid #D8D0C4", cursor: "pointer" }}>
                      {plan.price === 0 ? "Get started free" : "Get started"}
                    </button>
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Below-table actions */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "32px", flexWrap: "wrap" }}>
            <Link href="/pricing" style={{ textDecoration: "none" }}>
              <button style={{ height: "40px", padding: "0 20px", background: "transparent", color: "#6B6056", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", borderRadius: "4px", border: "1px solid #D8D0C4", cursor: "pointer" }}>
                See full pricing
              </button>
            </Link>
            <Link href="/auth/signup" style={{ textDecoration: "none" }}>
              <button style={{ height: "40px", padding: "0 20px", background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", borderRadius: "4px", border: "none", cursor: "pointer" }}>
                Get started
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ background: "#F5F0E8" }}>
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20 text-center">
          <div style={{ maxWidth: "640px", margin: "0 auto" }}>
            <div className="ruled-label" style={{ justifyContent: "center", marginBottom: "32px" }}>Ready to start?</div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(32px, 4vw, 52px)", color: "#1A1612", lineHeight: 1.08, letterSpacing: "-0.02em", marginBottom: "24px" }}>
              The right capital,<br />at the right stage.
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "16px", color: "#6B6056", lineHeight: 1.7, marginBottom: "40px" }}>
              Join founders and investors using CapitalReach to close deals faster.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
              <Link href="/auth/signup?role=startup" style={{ textDecoration: "none" }}>
                <button
                  style={{ background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "13px 32px", borderRadius: "4px", border: "none", cursor: "pointer" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#D4842A")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#B5651D")}
                >
                  List your startup
                </button>
              </Link>
              <Link href="/auth/signup?role=investor" style={{ textDecoration: "none" }}>
                <button
                  style={{ background: "transparent", color: "#1A1612", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "15px", padding: "12px 32px", borderRadius: "4px", border: "1px solid #D8D0C4", cursor: "pointer" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#9C8E82")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#D8D0C4")}
                >
                  Explore as investor →
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
