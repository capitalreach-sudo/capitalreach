"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { INDUSTRIES, STAGES } from "@/types";
import { INVESTOR_PLANS } from "@/lib/plans";
import { slugify } from "@/lib/utils";
import {
  TrendingUp, ChevronRight, ChevronLeft, CheckCircle2,
  Users, Settings, User, ShieldCheck, CreditCard,
  Globe, Twitter, Linkedin, Plus, Trash2, Building2, Lock,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

// ── Shared style tokens ────────────────────────────────────────
const iStyle: React.CSSProperties = {
  width: "100%", borderRadius: "4px",
  border: "1px solid var(--cr-rule-dark)",
  background: "var(--cr-paper-2)", padding: "10px 12px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300,
  fontSize: "14px", color: "var(--cr-ink)", outline: "none",
  boxSizing: "border-box", transition: "border-color 150ms",
};
// Numbers are data: numeric inputs render in mono like every other figure.
const iMono: React.CSSProperties = {
  ...iStyle, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px",
};
const taStyle: React.CSSProperties = { ...iStyle, resize: "none" };
const selStyle: React.CSSProperties = { ...iStyle, cursor: "pointer" };
const labelSt: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase",
  letterSpacing: "0.08em", display: "block", marginBottom: "6px",
};
const hintSt: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300,
  fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "6px", marginTop: "2px",
};
// House buttons: one copper pill per view; secondary is a hairline outline
// pill; back is a quiet text link. Light-on-copper comes from --cr-band-ink,
// which is light in every register, so no hex ever enters the component.
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
  background: "var(--cr-copper)", color: "var(--cr-band-ink)",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
  fontSize: "13px", height: "42px", padding: "0 24px",
  borderRadius: "999px", border: "none", cursor: "pointer", flexShrink: 0,
};
const outlineBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
  border: "1px solid var(--cr-paper-4)", color: "var(--cr-ink)",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: "13px", height: "42px", padding: "0 20px",
  borderRadius: "999px", background: "transparent", cursor: "pointer", flexShrink: 0,
};
const quietBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  border: "none", background: "transparent", color: "var(--cr-ink-3)",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
  fontSize: "13px", height: "42px", padding: "0 12px",
  cursor: "pointer", flexShrink: 0,
};
// Hairline rule between option groups within a step -- structure by line,
// never boxes-in-boxes.
const groupRule: React.CSSProperties = {
  borderTop: "1px solid var(--cr-rule)", paddingTop: "24px",
};
// A selectable ledger row: hairline-separated inside one bordered list,
// selection carried by the copper-bg/copper-br tokens plus an inset bar
// echoing the ruled-label, never a solid fill.
function optionRow(selected: boolean, first: boolean): React.CSSProperties {
  return {
    width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: "14px",
    padding: "14px 18px", minHeight: "44px", border: "none",
    borderTop: first ? "none" : "1px solid var(--cr-rule)",
    background: selected ? "var(--cr-copper-bg)" : "transparent",
    boxShadow: selected ? "inset 2px 0 0 0 var(--cr-copper)" : "none",
    cursor: "pointer", transition: "background 120ms ease, box-shadow 120ms ease",
  };
}
const optionList: React.CSSProperties = {
  border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden",
};

function onFocusCopper(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  (e.target as HTMLElement).style.borderColor = "var(--cr-copper)";
}
function onBlurRule(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  (e.target as HTMLElement).style.borderColor = "var(--cr-rule-dark)";
}

// ── Step config ────────────────────────────────────────────────
const STEPS = [
  { id: 1, labelKey: "onboarding.inv.step1", icon: Users,       descKey: "onboarding.inv.step1Desc" },
  { id: 2, labelKey: "onboarding.inv.step2", icon: Settings,    descKey: "onboarding.inv.step2Desc" },
  { id: 3, labelKey: "onboarding.inv.step3", icon: User,        descKey: "onboarding.inv.step3Desc" },
  { id: 4, labelKey: "onboarding.inv.step4", icon: Building2,   descKey: "onboarding.inv.step4Desc" },
  { id: 5, labelKey: "onboarding.inv.step5", icon: ShieldCheck, descKey: "onboarding.inv.step5Desc" },
  { id: 6, labelKey: "onboarding.inv.step6", icon: CreditCard,  descKey: "onboarding.inv.step6Desc" },
];

const INVESTOR_TYPES = [
  { value: "angel",        labelKey: "onboarding.inv.typeAngel", descKey: "onboarding.inv.typeAngelDesc", emoji: "👼" },
  { value: "vc",           labelKey: "onboarding.inv.typeVc",    descKey: "onboarding.inv.typeVcDesc",    emoji: "🏢" },
  { value: "family_office",labelKey: "onboarding.inv.typeFo",    descKey: "onboarding.inv.typeFoDesc",    emoji: "🏡" },
  { value: "corporate",    labelKey: "onboarding.inv.typeCorp",  descKey: "onboarding.inv.typeCorpDesc",  emoji: "🏭" },
] as const;

const AUM_RANGES = [
  "< $1M", "$1M – $5M", "$5M – $25M", "$25M – $100M",
  "$100M – $500M", "$500M – $1B", "$1B+",
];
const FOLLOW_ON_OPTIONS = [
  { value: "yes",       labelKey: "onboarding.inv.followOnYes"       },
  { value: "sometimes", labelKey: "onboarding.inv.followOnSometimes" },
  { value: "no",        labelKey: "onboarding.inv.followOnNo"        },
];
const BOARD_OPTIONS = [
  { value: "actively_seek", labelKey: "onboarding.inv.boardSeek"   },
  { value: "open",          labelKey: "onboarding.inv.boardOpen"   },
  { value: "no_preference", labelKey: "onboarding.inv.boardNoPref" },
  { value: "no",            labelKey: "onboarding.inv.boardNo"     },
];

interface PortfolioCompany { name: string; stage: string; year: string; }

// Every step opens the house way: ruled label carrying the mono 01/06
// counter, then the serif italic step title.
function StepHead({ n, label, title, sub }: { n: number; label: string; title: string; sub: string }) {
  return (
    <>
      <div className="ruled-label" style={{ marginBottom: "14px" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "var(--cr-copper)" }}>
          {String(n).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
        </span>
        {label}
      </div>
      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(22px, 3vw, 28px)", letterSpacing: "-0.01em", color: "var(--cr-ink)", marginBottom: "6px" }}>
        {title}
      </h2>
      <p style={{ ...hintSt, fontSize: "13px", lineHeight: 1.6, marginBottom: "24px" }}>{sub}</p>
    </>
  );
}

export default function InvestorOnboardingPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Step 1
  const [investorType, setInvestorType] = useState("");

  // Step 2
  const [industries, setIndustries]   = useState<string[]>([]);
  const [stages, setStagesPref]       = useState<string[]>([]);
  const [minCheck, setMinCheck]       = useState("");
  const [maxCheck, setMaxCheck]       = useState("");
  const [geography, setGeography]     = useState("");
  const [leadRounds, setLeadRounds]   = useState(false);

  // Step 3
  const [displayName, setDisplayName]             = useState("");
  const [firmName, setFirmName]                   = useState("");
  const [bio, setBio]                             = useState("");
  const [investmentThesis, setInvestmentThesis]   = useState("");
  const [website, setWebsite]                     = useState("");
  const [linkedin, setLinkedin]                   = useState("");
  const [twitter, setTwitter]                     = useState("");
  const [aum, setAum]                             = useState("");
  const [numberOfInvestments, setNumberOfInvestments] = useState("");

  // Step 4
  const [portfolioCompanies, setPortfolioCompanies] = useState<PortfolioCompany[]>([{ name: "", stage: "", year: "" }]);
  const [followOnPolicy, setFollowOnPolicy]         = useState("");
  const [boardSeatPref, setBoardSeatPref]           = useState("");
  const [avgHoldPeriod, setAvgHoldPeriod]           = useState("");

  // Step 5
  const [accredited, setAccredited]                     = useState(false);
  const [accreditedDeclaration, setAccreditedDeclaration] = useState(false);
  // Terms §1 requires 18+, and §7 warns of total loss. Both were asserted in
  // the Terms but never actually collected — record them explicitly.
  const [ageConfirmed, setAgeConfirmed]     = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  function toggleIndustry(val: string) {
    setIndustries(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  }
  function toggleStage(val: string) {
    setStagesPref(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  }
  function addPortfolioCompany() { setPortfolioCompanies(p => [...p, { name: "", stage: "", year: "" }]); }
  function removePortfolioCompany(i: number) { setPortfolioCompanies(p => p.filter((_, idx) => idx !== i)); }
  function updatePortfolioCompany(i: number, field: keyof PortfolioCompany, val: string) {
    setPortfolioCompanies(p => p.map((co, idx) => idx === i ? { ...co, [field]: val } : co));
  }

  async function handleSubmit(tier: string) {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth/login"); return; }

    // Same duplicate trap as the founder flow: checkout can bounce back here
    // and each press of a plan button ran another insert. One profile per
    // account — an existing row is updated, never joined by a twin.
    const { data: existing } = await supabase.from("investors")
      .select("id").eq("owner_id", user.id)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();

    const fields = {
      type: investorType,
      bio: bio || null, linkedin_url: linkedin || null,
      industries, stages,
      min_check: minCheck ? parseInt(minCheck) : null,
      max_check: maxCheck ? parseInt(maxCheck) : null,
      geography: geography ? geography.split(",").map(g => g.trim()) : [],
      display_name: displayName || null, firm_name: firmName || null,
      website: website || null, twitter_url: twitter || null,
      investment_thesis: investmentThesis || null, aum: aum || null,
      portfolio_json: portfolioCompanies.filter(c => c.name),
      follow_on_policy: followOnPolicy || null, board_seat_pref: boardSeatPref || null,
      lead_rounds: leadRounds,
      number_of_investments: numberOfInvestments ? parseInt(numberOfInvestments) : null,
      avg_hold_period: avgHoldPeriod || null,
    };

    let investor: { id: string } | null = null;
    let error: { message?: string } | null = null;
    if (existing) {
      const res = await supabase.from("investors").update(fields).eq("id", existing.id).select("id").single();
      investor = res.data; error = res.error;
    } else {
      const base   = slugify(displayName || firmName || "investor");
      const suffix = Math.random().toString(36).slice(2, 6);
      const res = await supabase.from("investors").insert({
        owner_id: user.id, slug: `${base}-${suffix}`, subscription_tier: "free",
        ...fields,
      }).select("id").single();
      investor = res.data; error = res.error;
    }

    if (error || !investor) {
      notify.error(t("onboarding.inv.errorCreating") + " " + (error?.message || ""));
      setLoading(false); return;
    }
    await supabase.from("profiles").update({
      accreditation_certified: accredited && accreditedDeclaration,
      // Timestamped record of what was actually asserted, so the Terms §1/§6
      // representations are evidenced rather than merely claimed.
      investor_declarations: {
        age_18_or_over: ageConfirmed,
        qualified_investor: accredited,
        own_due_diligence: accreditedDeclaration,
        risk_of_total_loss: riskAcknowledged,
        declared_at: new Date().toISOString(),
      },
      ...(displayName ? { full_name: displayName } : {}),
    }).eq("id", user.id);

    if (tier !== "free") {
      router.push(`/api/checkout/investor?tier=${tier}&from=onboarding`);
    } else {
      notify.success(t("onboarding.inv.created"));
      router.push("/dashboard/investor?welcome=1");
    }
    setLoading(false);
  }

  const canNext = () => {
    if (step === 1) return !!investorType;
    if (step === 3) return !!bio;
    if (step === 5) return accreditedDeclaration && ageConfirmed && riskAcknowledged;
    return true;
  };

  const progress = Math.round((step / STEPS.length) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cr-paper)" }}>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid var(--cr-rule)", background: "var(--cr-paper)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 24px", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <div style={{ width: 28, height: 28, background: "var(--cr-copper)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <TrendingUp style={{ width: 14, height: 14, color: "var(--cr-band-ink)" }} />
            </div>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "14px", color: "var(--cr-copper)" }}>CapitalReach</span>
            <span className="hidden sm:inline" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginLeft: "4px" }}>{t("onboarding.inv.forInvestors")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
            <div className="w-16 sm:w-40" style={{ height: "3px", background: "var(--cr-rule)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ height: "100%", background: "var(--cr-copper)", borderRadius: "2px", transition: "width 500ms ease", width: `${progress}%` }} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)" }}>{progress}%</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 24px" }}>
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8">

          {/* Sidebar: the numbered rail down the steps, ledger-line connected */}
          <div className="hidden lg:block">
            <div style={{ position: "sticky", top: "72px" }}>
              <p className="ruled-label" style={{ marginBottom: "16px" }}>{t("onboarding.su.steps")}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {STEPS.map(s => {
                  const done = s.id < step;
                  const active = s.id === step;
                  return (
                    <button key={s.id}
                      onClick={() => done && setStep(s.id)}
                      disabled={!done && !active}
                      style={{
                        width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px",
                        padding: "10px 12px", borderRadius: "4px", border: "none",
                        background: active ? "var(--cr-copper-bg)" : "transparent",
                        boxShadow: active ? "inset 2px 0 0 0 var(--cr-copper)" : "none",
                        cursor: done ? "pointer" : active ? "default" : "not-allowed",
                        transition: "background 120ms",
                      }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: "999px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "11px",
                        color: active || done ? "var(--cr-copper)" : "var(--cr-ink-4)",
                        background: active || done ? "var(--cr-copper-bg)" : "transparent",
                        border: active || done ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
                      }}>
                        {done
                          ? <CheckCircle2 style={{ width: 14, height: 14, color: "var(--cr-copper)" }} />
                          : String(s.id).padStart(2, "0")}
                      </span>
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", lineHeight: 1.2, color: active ? "var(--cr-copper)" : done ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>{t(s.labelKey)}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: active ? "var(--cr-ink-3)" : "var(--cr-ink-4)" }}>{t(s.descKey)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form */}
          <div>
            {/* Mobile progress -- copper is progress; green stays reserved for money */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px" }}>
              {STEPS.map(s => (
                <div key={s.id} style={{ flex: 1, height: "3px", borderRadius: "2px", background: s.id <= step ? "var(--cr-copper)" : "var(--cr-rule-dark)", opacity: s.id < step ? 0.45 : 1, transition: "background 300ms" }} />
              ))}
            </div>

            <div className="p-4 sm:p-8" style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule)", borderRadius: "4px", boxShadow: "var(--cr-card-shadow)" }}>

              {/* ─── STEP 1: Type ─────────────────────────────────────── */}
              {step === 1 && (
                <div>
                  <StepHead n={1} label={t(STEPS[0].labelKey)} title={t("onboarding.inv.h1")} sub={t("onboarding.inv.h1Sub")} />
                  <div style={optionList}>
                    {INVESTOR_TYPES.map((ty, i) => (
                      <button key={ty.value} onClick={() => setInvestorType(ty.value)}
                        style={{ ...optionRow(investorType === ty.value, i === 0), padding: "16px 18px" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", paddingTop: "2px", flexShrink: 0 }}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "3px" }}>{t(ty.labelKey)}</p>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", lineHeight: 1.55, color: "var(--cr-ink-3)" }}>{t(ty.descKey)}</p>
                        </div>
                        {investorType === ty.value && <CheckCircle2 style={{ width: 18, height: 18, color: "var(--cr-copper)", flexShrink: 0, marginTop: "2px" }} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── STEP 2: Preferences ─────────────────────────────── */}
              {step === 2 && (
                <div>
                  <StepHead n={2} label={t(STEPS[1].labelKey)} title={t("onboarding.inv.h2")} sub={t("onboarding.inv.h2Sub")} />

                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div>
                      <label style={labelSt}>{t("onboarding.inv.industriesLabel")}</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "12px" }}>
                        {INDUSTRIES.map(ind => (
                          <button key={ind} onClick={() => toggleIndustry(ind)}
                            style={{
                              display: "flex", alignItems: "center", gap: "8px", padding: "11px 10px", minHeight: "40px",
                              borderRadius: "3px", border: industries.includes(ind) ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule-dark)",
                              background: industries.includes(ind) ? "var(--cr-copper-bg)" : "transparent",
                              cursor: "pointer", transition: "all 120ms ease",
                            }}>
                            <input type="checkbox" readOnly checked={industries.includes(ind)}
                              style={{ accentColor: "var(--cr-copper)", width: 13, height: 13, flexShrink: 0, cursor: "pointer" }} />
                            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: industries.includes(ind) ? 500 : 400, fontSize: "12px", color: industries.includes(ind) ? "var(--cr-copper)" : "var(--cr-ink-3)" }}>{ind}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={groupRule}>
                      <label style={labelSt}>{t("onboarding.inv.preferredStages")}</label>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        {STAGES.map(s => (
                          <button key={s.value} onClick={() => toggleStage(s.value)}
                            style={{
                              padding: "10px 16px", minHeight: "40px", borderRadius: "3px",
                              border: stages.includes(s.value) ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule-dark)",
                              background: stages.includes(s.value) ? "var(--cr-copper-bg)" : "transparent",
                              fontFamily: "'DM Sans', sans-serif", fontWeight: stages.includes(s.value) ? 600 : 400,
                              fontSize: "13px", color: stages.includes(s.value) ? "var(--cr-copper)" : "var(--cr-ink-3)",
                              cursor: "pointer", transition: "all 120ms",
                            }}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-row-2" style={{ ...groupRule, gap: "16px" }}>
                      <div>
                        <label style={labelSt}>{t("onboarding.inv.minCheck")}</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-4)" }}>$</span>
                          <input type="number" value={minCheck} onChange={e => setMinCheck(e.target.value)}
                            placeholder="10,000" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iMono, paddingLeft: "26px" }} />
                        </div>
                      </div>
                      <div>
                        <label style={labelSt}>{t("onboarding.inv.maxCheck")}</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-4)" }}>$</span>
                          <input type="number" value={maxCheck} onChange={e => setMaxCheck(e.target.value)}
                            placeholder="500,000" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iMono, paddingLeft: "26px" }} />
                        </div>
                      </div>
                    </div>

                    <div style={groupRule}>
                      <label style={labelSt}>{t("onboarding.inv.geography")}</label>
                      <p style={hintSt}>{t("onboarding.inv.geographyHint")}</p>
                      <input type="text" value={geography} onChange={e => setGeography(e.target.value)}
                        placeholder={t("onboarding.inv.geographyPh")}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    <label style={{
                      ...groupRule,
                      display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", minHeight: "40px",
                    }}>
                      <input type="checkbox" checked={leadRounds} onChange={e => setLeadRounds(e.target.checked)}
                        style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: leadRounds ? "var(--cr-copper)" : "var(--cr-ink)", marginBottom: "2px" }}>{t("onboarding.inv.leadRounds")}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>{t("onboarding.inv.leadRoundsSub")}</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* ─── STEP 3: Profile ─────────────────────────────────── */}
              {step === 3 && (
                <div>
                  <StepHead n={3} label={t(STEPS[2].labelKey)} title={t("onboarding.inv.h3")} sub={t("onboarding.inv.h3Sub")} />

                  <div className="form-row-2" style={{ gap: "16px" }}>
                    <div>
                      <label style={labelSt}>{t("onboarding.inv.fullName")}</label>
                      <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                        placeholder="Sarah Chen" onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    {(investorType === "vc" || investorType === "family_office" || investorType === "corporate") && (
                      <div>
                        <label style={labelSt}>{t("onboarding.inv.firmName")}</label>
                        <div style={{ position: "relative" }}>
                          <Building2 style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                          <input type="text" value={firmName} onChange={e => setFirmName(e.target.value)}
                            placeholder="Sequoia Capital" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingLeft: "30px" }} />
                        </div>
                      </div>
                    )}

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.aumLabel")}</label>
                      <select value={aum} onChange={e => setAum(e.target.value)}
                        onFocus={onFocusCopper} onBlur={onBlurRule}
                        style={{ ...selStyle, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px" }}>
                        <option value="">{t("onboarding.inv.selectRange")}</option>
                        {AUM_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.numInvestments")}</label>
                      <input type="number" value={numberOfInvestments} onChange={e => setNumberOfInvestments(e.target.value)}
                        placeholder={t("onboarding.inv.numInvestmentsPh")} onFocus={onFocusCopper} onBlur={onBlurRule} style={iMono} />
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.website")}</label>
                      <div style={{ position: "relative" }}>
                        <Globe style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={website} onChange={e => setWebsite(e.target.value)}
                          placeholder="https://sarahchen.vc" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.linkedin")}</label>
                      <div style={{ position: "relative" }}>
                        <Linkedin style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={linkedin} onChange={e => setLinkedin(e.target.value)}
                          placeholder="linkedin.com/in/…" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.twitterX")}</label>
                      <div style={{ position: "relative" }}>
                        <Twitter style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={twitter} onChange={e => setTwitter(e.target.value)}
                          placeholder="@sarahchen" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>{t("onboarding.inv.shortBio")} <span style={{ color: "var(--cr-copper)" }}>*</span></label>
                      <p style={hintSt}>{t("onboarding.inv.bioHint")}</p>
                      <textarea value={bio} onChange={e => setBio(e.target.value)} rows={5}
                        placeholder="Angel investor focused on HealthTech and B2B SaaS. Former CMO at Stripe. Led 30+ investments at pre-seed and seed. Board member at 4 portfolio companies."
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={taStyle} />
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>{t("onboarding.inv.thesis")}</label>
                      <p style={hintSt}>{t("onboarding.inv.thesisHint")}</p>
                      <textarea value={investmentThesis} onChange={e => setInvestmentThesis(e.target.value)} rows={4}
                        placeholder="I invest in mission-driven founders using AI to reduce inequality in access to healthcare and education."
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={taStyle} />
                    </div>
                  </div>
                </div>
              )}

              {/* ─── STEP 4: Portfolio ────────────────────────────────── */}
              {step === 4 && (
                <div>
                  <StepHead n={4} label={t(STEPS[3].labelKey)} title={t("onboarding.inv.h4")} sub={t("onboarding.inv.h4Sub")} />

                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                        <div>
                          <label style={labelSt}>{t("onboarding.inv.portfolioLabel")}</label>
                          <p style={hintSt}>{t("onboarding.inv.portfolioHint")}</p>
                        </div>
                        {portfolioCompanies.length < 10 && (
                          <button onClick={addPortfolioCompany}
                            style={{ display: "flex", alignItems: "center", gap: "4px", minHeight: "40px", padding: "0 8px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", flexShrink: 0 }}>
                            <Plus style={{ width: 13, height: 13 }} /> {t("onboarding.inv.addCompany")}
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {portfolioCompanies.map((co, i) => (
                          // Name spans the full width on phones; stage, year and
                          // remove drop to a second line so nothing overflows 375px.
                          <div key={i} className="grid grid-cols-[1fr_92px_40px] sm:grid-cols-[1fr_132px_92px_40px] items-center" style={{ gap: "8px" }}>
                            <input type="text" value={co.name} onChange={e => updatePortfolioCompany(i, "name", e.target.value)}
                              className="col-span-3 sm:col-span-1"
                              placeholder={t("onboarding.inv.companyNamePh")} style={iStyle} />
                            <select value={co.stage} onChange={e => updatePortfolioCompany(i, "stage", e.target.value)}
                              style={selStyle}>
                              <option value="">{t("onboarding.inv.stagePh")}</option>
                              {["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "IPO", "Acquired"].map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <input type="number" value={co.year} onChange={e => updatePortfolioCompany(i, "year", e.target.value)}
                              placeholder={t("onboarding.inv.yearPh")} style={iMono} />
                            {portfolioCompanies.length > 1 && (
                              <button onClick={() => removePortfolioCompany(i)} aria-label={t("common.remove")}
                                style={{ width: 40, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", flexShrink: 0 }}>
                                <Trash2 style={{ width: 14, height: 14 }} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={groupRule}>
                      <label style={{ ...labelSt, marginBottom: "10px" }}>{t("onboarding.inv.followOn")}</label>
                      <div style={optionList}>
                        {FOLLOW_ON_OPTIONS.map((o, i) => (
                          <button key={o.value} onClick={() => setFollowOnPolicy(o.value)}
                            style={{
                              ...optionRow(followOnPolicy === o.value, i === 0),
                              alignItems: "center", padding: "12px 16px",
                              fontFamily: "'DM Sans', sans-serif", fontWeight: followOnPolicy === o.value ? 600 : 400, fontSize: "13px",
                              color: followOnPolicy === o.value ? "var(--cr-copper)" : "var(--cr-ink-3)",
                            }}>
                            {t(o.labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={groupRule}>
                      <label style={{ ...labelSt, marginBottom: "10px" }}>{t("onboarding.inv.boardPref")}</label>
                      <div style={optionList}>
                        {BOARD_OPTIONS.map((o, i) => (
                          <button key={o.value} onClick={() => setBoardSeatPref(o.value)}
                            style={{
                              ...optionRow(boardSeatPref === o.value, i === 0),
                              alignItems: "center", padding: "12px 16px",
                              fontFamily: "'DM Sans', sans-serif", fontWeight: boardSeatPref === o.value ? 600 : 400, fontSize: "13px",
                              color: boardSeatPref === o.value ? "var(--cr-copper)" : "var(--cr-ink-3)",
                            }}>
                            {t(o.labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={groupRule}>
                      <label style={labelSt}>{t("onboarding.inv.holdPeriod")}</label>
                      <input type="text" value={avgHoldPeriod} onChange={e => setAvgHoldPeriod(e.target.value)}
                        placeholder={t("onboarding.inv.holdPeriodPh")}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>
                  </div>
                </div>
              )}

              {/* ─── STEP 5: Accreditation ───────────────────────────── */}
              {step === 5 && (
                <div>
                  <StepHead n={5} label={t(STEPS[4].labelKey)} title={t("onboarding.inv.h5")} sub={t("onboarding.inv.h5Sub")} />

                  <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "16px 18px", marginBottom: "24px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <ShieldCheck style={{ width: 18, height: 18, color: "var(--cr-copper)", flexShrink: 0, marginTop: "1px" }} />
                    <div>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", marginBottom: "4px" }}>{t("onboarding.inv.legalReq")}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.55 }}>
                        {t("onboarding.inv.legalReqBody")}
                      </p>
                    </div>
                  </div>

                  <div style={optionList}>
                    <label style={{ ...optionRow(accredited, true), display: "flex" }}>
                      <input type="checkbox" checked={accredited} onChange={e => setAccredited(e.target.checked)}
                        style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, marginTop: "2px", flexShrink: 0, cursor: "pointer" }} />
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.accTitle")} <span style={{ fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "none" }}>· {t("onboarding.inv.accOptional")}</span></p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          {t("onboarding.inv.accBody")}
                        </p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", lineHeight: 1.55, marginTop: "6px" }}>
                          {t("onboarding.inv.accBrowseNote")}
                        </p>
                      </div>
                    </label>

                    <label style={{ ...optionRow(accreditedDeclaration, false), display: "flex" }}>
                      <input type="checkbox" checked={accreditedDeclaration} onChange={e => setAccreditedDeclaration(e.target.checked)}
                        style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, marginTop: "2px", flexShrink: 0, cursor: "pointer" }} />
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.riskTitle")}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          {t("onboarding.inv.riskBody")}
                        </p>
                      </div>
                    </label>

                    <label style={{ ...optionRow(ageConfirmed, false), display: "flex" }}>
                      <input type="checkbox" checked={ageConfirmed} onChange={e => setAgeConfirmed(e.target.checked)}
                        style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, marginTop: "2px", flexShrink: 0, cursor: "pointer" }} />
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.ageTitle")}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          {t("onboarding.inv.ageBody")}
                        </p>
                      </div>
                    </label>

                    <label style={{ ...optionRow(riskAcknowledged, false), display: "flex" }}>
                      <input type="checkbox" checked={riskAcknowledged} onChange={e => setRiskAcknowledged(e.target.checked)}
                        style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, marginTop: "2px", flexShrink: 0, cursor: "pointer" }} />
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.lossTitle")}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          {t("onboarding.inv.lossBody")}
                        </p>
                      </div>
                    </label>
                  </div>

                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textAlign: "center", marginTop: "16px" }}>
                    {t("onboarding.inv.certNote")}
                  </p>
                </div>
              )}

              {/* ─── STEP 6: Membership ──────────────────────────────── */}
              {step === 6 && (
                <div>
                  <StepHead n={6} label={t(STEPS[5].labelKey)} title={t("onboarding.inv.h6")} sub={t("onboarding.inv.h6Sub")} />

                  <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px 16px", marginBottom: "24px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)", marginBottom: "10px" }}>{t("onboarding.inv.unlocksTitle")}</p>
                    <div className="form-row-2" style={{ gap: "6px" }}>
                      {[
                        ["Free", t("onboarding.inv.unlockFree")],
                        ["Angel", t("onboarding.inv.unlockAngel")],
                        ["Pro", t("onboarding.inv.unlockPro")],
                        ["Institutional", t("onboarding.inv.unlockInst")],
                      ].map(([tier, desc]) => (
                        <div key={tier} style={{ display: "flex", alignItems: "baseline", gap: "8px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)" }}>
                          <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "9px", flexShrink: 0 }}>✦</span>
                          <span><strong>{tier}:</strong> {desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Plans as one ruled ledger, not four nested cards. The
                      highlighted tier carries the single primary pill. */}
                  <div style={optionList}>
                    {[
                      {
                        tier: "free", name: INVESTOR_PLANS.free.name, price: t("common.free"), highlight: false,
                        desc: t("onboarding.inv.planExplorerDesc"),
                        features: [t("onboarding.inv.ef1"), t("onboarding.inv.ef2"), t("onboarding.inv.ef3")],
                        locked: [t("onboarding.inv.el1"), t("onboarding.inv.el2"), t("onboarding.inv.el3"), t("onboarding.inv.el4")],
                      },
                      {
                        tier: "angel", name: INVESTOR_PLANS.angel.name, price: `$${INVESTOR_PLANS.angel.price}/mo`, highlight: false,
                        desc: t("onboarding.inv.planAngelDesc"),
                        features: [t("onboarding.inv.af1"), t("onboarding.inv.af2"), t("onboarding.inv.af3"), t("onboarding.inv.af4"), t("onboarding.inv.af5")],
                        locked: [t("onboarding.inv.al1"), t("onboarding.inv.al2"), t("onboarding.inv.al3"), t("onboarding.inv.al4")],
                      },
                      {
                        tier: "pro_investor", name: INVESTOR_PLANS.pro.name, price: `$${INVESTOR_PLANS.pro.price}/mo`, highlight: true,
                        desc: t("onboarding.inv.planProDesc"),
                        features: [t("onboarding.inv.pf1"), t("onboarding.inv.pf2"), t("onboarding.inv.pf3"), t("onboarding.inv.pf4"), t("onboarding.inv.pf5"), t("onboarding.inv.pf6")],
                        locked: [],
                      },
                      {
                        tier: "institutional", name: INVESTOR_PLANS.institution.name, price: t("onboarding.inv.custom"), highlight: false,
                        desc: t("onboarding.inv.planInstDesc"),
                        features: [t("onboarding.inv.if1"), t("onboarding.inv.if2"), t("onboarding.inv.if3"), t("onboarding.inv.if4"), t("onboarding.inv.if5")],
                        locked: [],
                      },
                    ].map((plan, planIdx) => (
                      <div key={plan.tier} className="p-4 sm:p-5" style={{
                        borderTop: planIdx === 0 ? "none" : "1px solid var(--cr-rule)",
                        background: plan.highlight ? "var(--cr-copper-bg)" : "transparent",
                        boxShadow: plan.highlight ? "inset 2px 0 0 0 var(--cr-copper)" : "none",
                      }}>
                        <div className="flex flex-wrap items-start justify-between" style={{ gap: "12px", marginBottom: "12px" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "16px", color: "var(--cr-ink)" }}>{plan.name}</span>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "14px", color: plan.highlight ? "var(--cr-copper)" : "var(--cr-ink-3)" }}>{plan.price}</span>
                              {plan.highlight && (
                                <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", padding: "3px 8px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("onboarding.su.mostPopular")}</span>
                              )}
                            </div>
                            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{plan.desc}</p>
                          </div>
                          <button
                            disabled={loading}
                            className="w-full sm:w-auto"
                            onClick={() => {
                              if (plan.tier === "institutional") { router.push("/contact?type=institutional"); }
                              else { handleSubmit(plan.tier); }
                            }}
                            style={{ ...plan.highlight ? primaryBtn : outlineBtn, opacity: loading ? 0.5 : 1 }}>
                            {plan.tier === "institutional" ? t("pricing.contactSales") : plan.tier === "free" ? t("onboarding.su.startFree") : t("onboarding.su.selectPlan", { name: plan.name })}
                          </button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                          {plan.features.map(f => (
                            <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <CheckCircle2 style={{ width: 12, height: 12, color: "var(--cr-copper)", flexShrink: 0 }} />
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)" }}>{f}</span>
                            </div>
                          ))}
                          {plan.locked.map(f => (
                            <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <Lock style={{ width: 12, height: 12, color: "var(--cr-ink-4)", flexShrink: 0 }} />
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>{f}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation: quiet back link, one copper pill forward */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--cr-rule)" }}>
                {step > 1 && (
                  <button style={quietBtn} onClick={() => setStep(s => s - 1)}>
                    <ChevronLeft style={{ width: 14, height: 14 }} /> {t("onboarding.back")}
                  </button>
                )}
                {step < 6 && (
                  <button style={{ ...primaryBtn, flex: 1, opacity: !canNext() ? 0.4 : 1, cursor: !canNext() ? "not-allowed" : "pointer" }}
                    onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                    {t("onboarding.continue")} <ChevronRight style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
