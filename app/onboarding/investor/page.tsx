"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { INDUSTRIES, STAGES } from "@/types";
import { slugify } from "@/lib/utils";
import {
  TrendingUp, ChevronRight, ChevronLeft, CheckCircle2,
  Users, Settings, User, ShieldCheck, CreditCard,
  Globe, Twitter, Linkedin, Plus, Trash2, Building2, Lock,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

// ── Shared style tokens ────────────────────────────────────────
const iStyle: React.CSSProperties = {
  width: "100%", borderRadius: "3px",
  border: "1px solid var(--cr-rule-dark)",
  background: "var(--cr-paper-2)", padding: "8px 12px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300,
  fontSize: "14px", color: "var(--cr-ink)", outline: "none",
  boxSizing: "border-box", transition: "border-color 150ms",
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
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  background: "var(--cr-copper)", color: "#fff",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
  fontSize: "13px", height: "42px", padding: "0 20px",
  borderRadius: "4px", border: "none", cursor: "pointer", flexShrink: 0,
};
const outlineBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: "13px", height: "42px", padding: "0 16px",
  borderRadius: "4px", background: "transparent", cursor: "pointer", flexShrink: 0,
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

    const base   = slugify(displayName || firmName || "investor");
    const suffix = Math.random().toString(36).slice(2, 6);
    const slug   = `${base}-${suffix}`;

    const { data: investor, error } = await supabase.from("investors").insert({
      owner_id: user.id, slug, type: investorType,
      bio: bio || null, linkedin_url: linkedin || null,
      industries, stages,
      min_check: minCheck ? parseInt(minCheck) : null,
      max_check: maxCheck ? parseInt(maxCheck) : null,
      geography: geography ? geography.split(",").map(g => g.trim()) : [],
      subscription_tier: "free",
      display_name: displayName || null, firm_name: firmName || null,
      website: website || null, twitter_url: twitter || null,
      investment_thesis: investmentThesis || null, aum: aum || null,
      portfolio_json: portfolioCompanies.filter(c => c.name),
      follow_on_policy: followOnPolicy || null, board_seat_pref: boardSeatPref || null,
      lead_rounds: leadRounds,
      number_of_investments: numberOfInvestments ? parseInt(numberOfInvestments) : null,
      avg_hold_period: avgHoldPeriod || null,
    }).select().single();

    if (error || !investor) {
      notify.error(t("onboarding.inv.errorCreating") + " " + (error?.message || ""));
      setLoading(false); return;
    }
    await supabase.from("profiles").update({
      accreditation_certified: accredited && accreditedDeclaration,
      ...(displayName ? { full_name: displayName } : {}),
    }).eq("id", user.id);

    if (tier !== "free") {
      router.push(`/api/checkout/investor?tier=${tier}`);
    } else {
      notify.success(t("onboarding.inv.created"));
      router.push("/dashboard/investor");
    }
    setLoading(false);
  }

  const canNext = () => {
    if (step === 1) return !!investorType;
    if (step === 3) return !!bio;
    if (step === 5) return accredited && accreditedDeclaration;
    return true;
  };

  const progress = Math.round((step / STEPS.length) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cr-paper)" }}>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid var(--cr-rule)", background: "var(--cr-paper)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 24px", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: 28, height: 28, background: "var(--cr-copper)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUp style={{ width: 14, height: 14, color: "#fff" }} />
            </div>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "14px", color: "var(--cr-copper)" }}>CapitalReach</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginLeft: "4px" }}>{t("onboarding.inv.forInvestors")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "160px", height: "3px", background: "var(--cr-rule)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ height: "100%", background: "var(--cr-copper)", borderRadius: "2px", transition: "width 500ms ease", width: `${progress}%` }} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-4)" }}>{progress}%</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 24px" }}>
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8">

          {/* Sidebar */}
          <div className="hidden lg:block">
            <div style={{ position: "sticky", top: "72px" }}>
              <p style={{ ...labelSt, marginBottom: "16px", paddingLeft: "12px" }}>{t("onboarding.su.steps")}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {STEPS.map(s => {
                  const Icon = s.icon;
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
                        cursor: done ? "pointer" : active ? "default" : "not-allowed",
                        transition: "background 120ms",
                      }}>
                      <div style={{ width: 28, height: 28, borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: active ? "var(--cr-copper)" : done ? "var(--cr-up-bg)" : "var(--cr-paper-3)", border: active ? "none" : done ? "1px solid rgba(45,106,79,0.2)" : "1px solid var(--cr-rule)" }}>
                        {done
                          ? <CheckCircle2 style={{ width: 14, height: 14, color: "var(--cr-up)" }} />
                          : <Icon style={{ width: 14, height: 14, color: active ? "#fff" : "var(--cr-ink-4)" }} />}
                      </div>
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", lineHeight: 1.2, color: active ? "var(--cr-copper)" : done ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>{t(s.labelKey)}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: active ? "var(--cr-copper)" : "var(--cr-ink-4)" }}>{t(s.descKey)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form */}
          <div>
            {/* Mobile progress */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px" }}>
              {STEPS.map(s => (
                <div key={s.id} style={{ flex: 1, height: "3px", borderRadius: "2px", background: s.id < step ? "var(--cr-up)" : s.id === step ? "var(--cr-copper)" : "var(--cr-rule-dark)", transition: "background 300ms" }} />
              ))}
            </div>

            <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "32px" }}>

              {/* ─── STEP 1: Type ─────────────────────────────────────── */}
              {step === 1 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.h1")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.inv.h1Sub")}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {INVESTOR_TYPES.map(ty => (
                      <button key={ty.value} onClick={() => setInvestorType(ty.value)}
                        style={{
                          width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: "16px",
                          padding: "18px 20px", borderRadius: "4px",
                          border: investorType === ty.value ? "2px solid var(--cr-copper)" : "2px solid var(--cr-rule-dark)",
                          background: investorType === ty.value ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                          cursor: "pointer", transition: "all 120ms ease",
                        }}>
                        <span style={{ fontSize: "28px", flexShrink: 0 }}>{ty.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "3px" }}>{t(ty.labelKey)}</p>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)" }}>{t(ty.descKey)}</p>
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
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.h2")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.inv.h2Sub")}</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div>
                      <label style={labelSt}>{t("onboarding.inv.industriesLabel")}</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                        {INDUSTRIES.map(ind => (
                          <button key={ind} onClick={() => toggleIndustry(ind)}
                            style={{
                              display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px",
                              borderRadius: "3px", border: industries.includes(ind) ? "1px solid var(--cr-copper)" : "1px solid var(--cr-rule-dark)",
                              background: industries.includes(ind) ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                              cursor: "pointer", transition: "all 120ms ease",
                            }}>
                            <input type="checkbox" readOnly checked={industries.includes(ind)}
                              style={{ accentColor: "var(--cr-copper)", width: 13, height: 13, flexShrink: 0, cursor: "pointer" }} />
                            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: industries.includes(ind) ? "var(--cr-copper)" : "var(--cr-ink-3)" }}>{ind}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.preferredStages")}</label>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {STAGES.map(s => (
                          <button key={s.value} onClick={() => toggleStage(s.value)}
                            style={{
                              padding: "8px 16px", borderRadius: "3px",
                              border: stages.includes(s.value) ? "1px solid var(--cr-copper)" : "1px solid var(--cr-rule-dark)",
                              background: stages.includes(s.value) ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                              fontFamily: "'DM Sans', sans-serif", fontWeight: stages.includes(s.value) ? 600 : 400,
                              fontSize: "13px", color: stages.includes(s.value) ? "var(--cr-copper)" : "var(--cr-ink-3)",
                              cursor: "pointer", transition: "all 120ms",
                            }}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div>
                        <label style={labelSt}>{t("onboarding.inv.minCheck")}</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>$</span>
                          <input type="number" value={minCheck} onChange={e => setMinCheck(e.target.value)}
                            placeholder="10,000" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingLeft: "24px" }} />
                        </div>
                      </div>
                      <div>
                        <label style={labelSt}>{t("onboarding.inv.maxCheck")}</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>$</span>
                          <input type="number" value={maxCheck} onChange={e => setMaxCheck(e.target.value)}
                            placeholder="500,000" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingLeft: "24px" }} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.geography")}</label>
                      <p style={hintSt}>{t("onboarding.inv.geographyHint")}</p>
                      <input type="text" value={geography} onChange={e => setGeography(e.target.value)}
                        placeholder={t("onboarding.inv.geographyPh")}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", padding: "14px 16px", borderRadius: "4px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)" }}>
                      <input type="checkbox" checked={leadRounds} onChange={e => setLeadRounds(e.target.checked)}
                        style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "2px" }}>{t("onboarding.inv.leadRounds")}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>{t("onboarding.inv.leadRoundsSub")}</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* ─── STEP 3: Profile ─────────────────────────────────── */}
              {step === 3 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.h3")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.inv.h3Sub")}</p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
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
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={selStyle}>
                        <option value="">{t("onboarding.inv.selectRange")}</option>
                        {AUM_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.numInvestments")}</label>
                      <input type="number" value={numberOfInvestments} onChange={e => setNumberOfInvestments(e.target.value)}
                        placeholder={t("onboarding.inv.numInvestmentsPh")} onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
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
                        <Linkedin style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#0077B5" }} />
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
                      <label style={labelSt}>{t("onboarding.inv.shortBio")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
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
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.h4")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.inv.h4Sub")}</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <div>
                          <label style={labelSt}>{t("onboarding.inv.portfolioLabel")}</label>
                          <p style={hintSt}>{t("onboarding.inv.portfolioHint")}</p>
                        </div>
                        {portfolioCompanies.length < 10 && (
                          <button onClick={addPortfolioCompany}
                            style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)" }}>
                            <Plus style={{ width: 13, height: 13 }} /> {t("onboarding.inv.addCompany")}
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {portfolioCompanies.map((co, i) => (
                          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input type="text" value={co.name} onChange={e => updatePortfolioCompany(i, "name", e.target.value)}
                              placeholder={t("onboarding.inv.companyNamePh")} style={{ ...iStyle, flex: 1 }} />
                            <select value={co.stage} onChange={e => updatePortfolioCompany(i, "stage", e.target.value)}
                              style={{ ...selStyle, width: "130px" }}>
                              <option value="">{t("onboarding.inv.stagePh")}</option>
                              {["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "IPO", "Acquired"].map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <input type="number" value={co.year} onChange={e => updatePortfolioCompany(i, "year", e.target.value)}
                              placeholder={t("onboarding.inv.yearPh")} style={{ ...iStyle, width: "80px" }} />
                            {portfolioCompanies.length > 1 && (
                              <button onClick={() => removePortfolioCompany(i)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", flexShrink: 0 }}>
                                <Trash2 style={{ width: 14, height: 14 }} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.followOn")}</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                        {FOLLOW_ON_OPTIONS.map(o => (
                          <button key={o.value} onClick={() => setFollowOnPolicy(o.value)}
                            style={{
                              width: "100%", textAlign: "left", padding: "12px 16px", borderRadius: "4px",
                              border: followOnPolicy === o.value ? "2px solid var(--cr-copper)" : "2px solid var(--cr-rule-dark)",
                              background: followOnPolicy === o.value ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                              fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
                              color: followOnPolicy === o.value ? "var(--cr-copper)" : "var(--cr-ink-3)",
                              cursor: "pointer", transition: "all 120ms",
                            }}>
                            {t(o.labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.inv.boardPref")}</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                        {BOARD_OPTIONS.map(o => (
                          <button key={o.value} onClick={() => setBoardSeatPref(o.value)}
                            style={{
                              width: "100%", textAlign: "left", padding: "12px 16px", borderRadius: "4px",
                              border: boardSeatPref === o.value ? "2px solid var(--cr-copper)" : "2px solid var(--cr-rule-dark)",
                              background: boardSeatPref === o.value ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                              fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
                              color: boardSeatPref === o.value ? "var(--cr-copper)" : "var(--cr-ink-3)",
                              cursor: "pointer", transition: "all 120ms",
                            }}>
                            {t(o.labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
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
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.h5")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.inv.h5Sub")}</p>

                  <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "16px 18px", marginBottom: "24px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <ShieldCheck style={{ width: 18, height: 18, color: "var(--cr-copper)", flexShrink: 0, marginTop: "1px" }} />
                    <div>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", marginBottom: "4px" }}>{t("onboarding.inv.legalReq")}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-copper)", lineHeight: 1.5 }}>
                        {t("onboarding.inv.legalReqBody")}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <label style={{
                      display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px 18px",
                      border: `2px solid ${accredited ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`,
                      borderRadius: "4px", cursor: "pointer", background: accredited ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                      transition: "all 120ms",
                    }}>
                      <input type="checkbox" checked={accredited} onChange={e => setAccredited(e.target.checked)}
                        style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, marginTop: "2px", flexShrink: 0, cursor: "pointer" }} />
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.accTitle")}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          {t("onboarding.inv.accBody")}
                        </p>
                      </div>
                    </label>

                    <label style={{
                      display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px 18px",
                      border: `2px solid ${accreditedDeclaration ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`,
                      borderRadius: "4px", cursor: "pointer", background: accreditedDeclaration ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                      transition: "all 120ms",
                    }}>
                      <input type="checkbox" checked={accreditedDeclaration} onChange={e => setAccreditedDeclaration(e.target.checked)}
                        style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, marginTop: "2px", flexShrink: 0, cursor: "pointer" }} />
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.riskTitle")}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          {t("onboarding.inv.riskBody")}
                        </p>
                      </div>
                    </label>

                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textAlign: "center" }}>
                      {t("onboarding.inv.certNote")}
                    </p>
                  </div>
                </div>
              )}

              {/* ─── STEP 6: Membership ──────────────────────────────── */}
              {step === 6 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.inv.h6")}</h2>
                  <p style={{ ...hintSt, marginBottom: "16px" }}>{t("onboarding.inv.h6Sub")}</p>

                  <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px 16px", marginBottom: "20px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)", marginBottom: "10px" }}>{t("onboarding.inv.unlocksTitle")}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      {[
                        ["Free", t("onboarding.inv.unlockFree")],
                        ["Angel", t("onboarding.inv.unlockAngel")],
                        ["Pro", t("onboarding.inv.unlockPro")],
                        ["Institutional", t("onboarding.inv.unlockInst")],
                      ].map(([tier, desc]) => (
                        <div key={tier} style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-3)" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cr-copper)", flexShrink: 0 }} />
                          <span><strong>{tier}:</strong> {desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {[
                      {
                        tier: "free", name: "Explorer", price: t("common.free"), highlight: false,
                        desc: t("onboarding.inv.planExplorerDesc"),
                        features: [t("onboarding.inv.ef1"), t("onboarding.inv.ef2"), t("onboarding.inv.ef3")],
                        locked: [t("onboarding.inv.el1"), t("onboarding.inv.el2"), t("onboarding.inv.el3"), t("onboarding.inv.el4")],
                      },
                      {
                        tier: "angel", name: "Angel", price: "$99/mo", highlight: false,
                        desc: t("onboarding.inv.planAngelDesc"),
                        features: [t("onboarding.inv.af1"), t("onboarding.inv.af2"), t("onboarding.inv.af3"), t("onboarding.inv.af4"), t("onboarding.inv.af5")],
                        locked: [t("onboarding.inv.al1"), t("onboarding.inv.al2"), t("onboarding.inv.al3"), t("onboarding.inv.al4")],
                      },
                      {
                        tier: "pro_investor", name: "Pro", price: "$299/mo", highlight: true,
                        desc: t("onboarding.inv.planProDesc"),
                        features: [t("onboarding.inv.pf1"), t("onboarding.inv.pf2"), t("onboarding.inv.pf3"), t("onboarding.inv.pf4"), t("onboarding.inv.pf5"), t("onboarding.inv.pf6")],
                        locked: [],
                      },
                      {
                        tier: "institutional", name: "Institutional", price: t("onboarding.inv.custom"), highlight: false,
                        desc: t("onboarding.inv.planInstDesc"),
                        features: [t("onboarding.inv.if1"), t("onboarding.inv.if2"), t("onboarding.inv.if3"), t("onboarding.inv.if4"), t("onboarding.inv.if5")],
                        locked: [],
                      },
                    ].map(plan => (
                      <div key={plan.tier} style={{
                        position: "relative", borderRadius: "4px", overflow: "hidden",
                        border: plan.highlight ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule-dark)",
                        background: "var(--cr-paper-3)", padding: "18px 20px",
                      }}>
                        {plan.highlight && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "var(--cr-copper)" }} />}
                        {plan.highlight && (
                          <div style={{ position: "absolute", top: "14px", right: "14px" }}>
                            <span style={{ background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "10px", padding: "3px 8px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("onboarding.su.mostPopular")}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "16px", color: "var(--cr-ink)" }}>{plan.name}</span>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "14px", color: plan.highlight ? "var(--cr-copper)" : "var(--cr-ink-3)" }}>{plan.price}</span>
                            </div>
                            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{plan.desc}</p>
                          </div>
                          <button
                            disabled={loading}
                            onClick={() => {
                              if (plan.tier === "institutional") { router.push("/contact?type=institutional"); }
                              else { handleSubmit(plan.tier); }
                            }}
                            style={{ ...plan.highlight ? primaryBtn : outlineBtn, marginLeft: "16px", opacity: loading ? 0.5 : 1 }}>
                            {plan.tier === "institutional" ? t("pricing.contactSales") : plan.tier === "free" ? t("onboarding.su.startFree") : t("onboarding.su.selectPlan", { name: plan.name })}
                          </button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                          {plan.features.map(f => (
                            <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <CheckCircle2 style={{ width: 12, height: 12, color: "var(--cr-up)", flexShrink: 0 }} />
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

              {/* Navigation */}
              <div style={{ display: "flex", gap: "10px", marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--cr-rule)" }}>
                {step > 1 && (
                  <button style={outlineBtn} onClick={() => setStep(s => s - 1)}>
                    <ChevronLeft style={{ width: 14, height: 14 }} /> {t("onboarding.back")}
                  </button>
                )}
                {step < 6 && (
                  <button style={{ ...primaryBtn, flex: 1, justifyContent: "center", opacity: !canNext() ? 0.4 : 1, cursor: !canNext() ? "not-allowed" : "pointer" }}
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
