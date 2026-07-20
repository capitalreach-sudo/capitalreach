"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { INDUSTRIES, STAGES } from "@/types";
import { slugify } from "@/lib/utils";
import {
  TrendingUp, ChevronRight, ChevronLeft, Plus, Trash2, Upload,
  CheckCircle2, Building2, Users, Lightbulb, BarChart3, Target,
  FileText, CreditCard, Globe, Twitter, Link2, Linkedin, Lock,
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
  { id: 1, labelKey: "onboarding.su.step1", icon: Building2,  descKey: "onboarding.su.step1Desc" },
  { id: 2, labelKey: "onboarding.su.step2", icon: Users,      descKey: "onboarding.su.step2Desc" },
  { id: 3, labelKey: "onboarding.su.step3", icon: Lightbulb,  descKey: "onboarding.su.step3Desc" },
  { id: 4, labelKey: "onboarding.su.step4", icon: BarChart3,  descKey: "onboarding.su.step4Desc" },
  { id: 5, labelKey: "onboarding.su.step5", icon: Target,     descKey: "onboarding.su.step5Desc" },
  { id: 6, labelKey: "onboarding.su.step6", icon: FileText,   descKey: "onboarding.su.step6Desc" },
  { id: 7, labelKey: "onboarding.su.step7", icon: CreditCard, descKey: "onboarding.su.step7Desc" },
];

const BUSINESS_MODELS  = ["B2B", "B2C", "B2B2C", "Marketplace", "Platform", "Direct-to-Consumer", "Other"];
const REVENUE_MODELS   = ["SaaS Subscription", "Usage-based / Metered", "Transaction Fee", "Ad-supported", "Hardware + Software", "Professional Services", "Freemium", "Licensing", "Other"];
const TEAM_SIZES       = ["1–2 (Solo / Co-founder)", "3–5", "6–10", "11–25", "26–50", "50+"];
const COMPANY_TYPES    = ["Private", "Delaware C-Corp", "LLC", "S-Corp", "Sole Proprietorship", "Other"];

interface Founder    { name: string; role: string; linkedin_url: string; twitter_url: string; bio: string; }
interface Milestone  { date: string; description: string; }
interface Competitor { name: string; differentiator: string; }

export default function StartupOnboardingPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Step 1 — Company
  const [name, setName]               = useState("");
  const [logoUrl, setLogoUrl]         = useState("");
  const [website, setWebsite]         = useState("");
  const [tagline, setTagline]         = useState("");
  const [description, setDescription] = useState("");
  const [foundedDate, setFoundedDate] = useState("");
  const [city, setCity]               = useState("");
  const [country, setCountry]         = useState("");
  const [industry, setIndustry]       = useState("");
  const [stage, setStage]             = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [revenueModel, setRevenueModel]   = useState("");
  const [teamSize, setTeamSize]           = useState("");
  const [companyType, setCompanyType]     = useState("");

  // Step 2 — Team
  const [founders, setFounders] = useState<Founder[]>([{ name: "", role: "", linkedin_url: "", twitter_url: "", bio: "" }]);

  // Step 3 — Pitch
  const [problem, setProblem]       = useState("");
  const [solution, setSolution]     = useState("");
  const [market, setMarket]         = useState("");
  const [advantage, setAdvantage]   = useState("");
  const [competitors, setCompetitors] = useState<Competitor[]>([{ name: "", differentiator: "" }]);

  // Step 4 — Traction
  const [mrr, setMrr]                     = useState("");
  const [arr, setArr]                     = useState("");
  const [userCount, setUserCount]         = useState("");
  const [payingCustomers, setPayingCustomers] = useState("");
  const [growthRate, setGrowthRate]       = useState("");
  const [churnRate, setChurnRate]         = useState("");
  const [milestones, setMilestones]       = useState<Milestone[]>([{ date: "", description: "" }]);

  // Step 5 — Ask
  const [fundingTarget, setFundingTarget] = useState("");
  const [equity, setEquity]               = useState("");
  const [minCheck, setMinCheck]           = useState("");
  const [useOfFunds, setUseOfFunds]       = useState("");
  const [runway, setRunway]               = useState("");

  // Step 6 — Documents
  const [demoVideoUrl, setDemoVideoUrl]       = useState("");
  const [pitchDeckUrl, setPitchDeckUrl]       = useState("");
  const [productHuntUrl, setProductHuntUrl]   = useState("");
  const [twitterUrl, setTwitterUrl]           = useState("");

  // Founders
  function addFounder() { setFounders(f => [...f, { name: "", role: "", linkedin_url: "", twitter_url: "", bio: "" }]); }
  function removeFounder(i: number) { setFounders(f => f.filter((_, idx) => idx !== i)); }
  function updateFounder(i: number, field: keyof Founder, val: string) {
    setFounders(f => f.map((fo, idx) => idx === i ? { ...fo, [field]: val } : fo));
  }

  // Milestones
  function addMilestone() { setMilestones(m => [...m, { date: "", description: "" }]); }
  function removeMilestone(i: number) { setMilestones(m => m.filter((_, idx) => idx !== i)); }
  function updateMilestone(i: number, field: keyof Milestone, val: string) {
    setMilestones(m => m.map((mi, idx) => idx === i ? { ...mi, [field]: val } : mi));
  }

  // Competitors
  function addCompetitor() { setCompetitors(c => [...c, { name: "", differentiator: "" }]); }
  function removeCompetitor(i: number) { setCompetitors(c => c.filter((_, idx) => idx !== i)); }
  function updateCompetitor(i: number, field: keyof Competitor, val: string) {
    setCompetitors(c => c.map((ci, idx) => idx === i ? { ...ci, [field]: val } : ci));
  }

  async function handleSubmit() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth/login"); return; }

    const slug = slugify(name) + "-" + Math.random().toString(36).slice(2, 6);

    const { data: startup, error } = await supabase.from("startups").insert({
      owner_id: user.id, slug, name,
      website: website || null, tagline,
      description: description || null, industry, stage, country,
      funding_target: parseInt(fundingTarget) || 0,
      equity_offered: equity ? parseFloat(equity) : null,
      min_check_size: minCheck ? parseInt(minCheck) : null,
      use_of_funds: useOfFunds || null,
      problem: problem || null, solution: solution || null,
      market: market || null, competitive_advantage: advantage || null,
      mrr: mrr ? parseInt(mrr) : null, arr: arr ? parseInt(arr) : null,
      user_count: userCount ? parseInt(userCount) : null,
      growth_rate: growthRate ? parseFloat(growthRate) : null,
      demo_video_url: demoVideoUrl || null,
      status: "pending_review", subscription_tier: "free",
      city: city || null, business_model: businessModel || null,
      revenue_model: revenueModel || null, team_size: teamSize || null,
      company_type: companyType || null,
      churn_rate: churnRate ? parseFloat(churnRate) : null,
      paying_customers: payingCustomers ? parseInt(payingCustomers) : null,
      pitch_deck_url: pitchDeckUrl || null,
      product_hunt_url: productHuntUrl || null,
      twitter_url: twitterUrl || null,
      runway_months: runway ? parseInt(runway) : null,
      competitors_json: competitors.filter(c => c.name),
    }).select().single();

    if (error || !startup) {
      notify.error(t("onboarding.su.errorSaving") + " " + (error?.message || ""));
      setLoading(false); return;
    }

    const validFounders = founders.filter(f => f.name && f.role);
    if (validFounders.length > 0) {
      await supabase.from("startup_founders").insert(
        validFounders.map(f => ({
          startup_id: startup.id, name: f.name, role: f.role,
          linkedin_url: f.linkedin_url || null, twitter_url: f.twitter_url || null, bio: f.bio || null,
        }))
      );
    }
    const validMilestones = milestones.filter(m => m.date && m.description);
    if (validMilestones.length > 0) {
      await supabase.from("startup_milestones").insert(
        validMilestones.map(m => ({ startup_id: startup.id, ...m }))
      );
    }
    await fetch("/api/admin/notify-review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId: startup.id }),
    }).catch(() => {});

    notify.success(t("onboarding.su.submitted"));
    router.push("/dashboard/startup");
    setLoading(false);
  }

  const canNext = () => {
    if (step === 1) return !!(name && tagline && country && industry && stage);
    if (step === 2) return founders.some(f => f.name && f.role);
    if (step === 3) return !!(problem && solution);
    if (step === 5) return !!fundingTarget;
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
                      onClick={() => s.id < step && setStep(s.id)}
                      disabled={s.id > step}
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

              {/* ─── STEP 1: Company ────────────────────────────────── */}
              {step === 1 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.su.h1")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.su.h1Sub")}</p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>{t("onboarding.su.companyName")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                      <input type="text" value={name} onChange={e => setName(e.target.value)}
                        placeholder="Acme Inc." onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>{t("onboarding.su.tagline")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                      <input type="text" value={tagline} onChange={e => setTagline(e.target.value)}
                        placeholder={t("onboarding.su.taglinePh")} maxLength={120}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                      <p style={{ ...hintSt, marginTop: "4px" }}>{t("onboarding.su.taglineCount", { count: tagline.length })}</p>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>{t("onboarding.su.companyDesc")}</label>
                      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                        placeholder={t("onboarding.su.companyDescPh")}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={taStyle} />
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.website")}</label>
                      <div style={{ position: "relative" }}>
                        <Globe style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={website} onChange={e => setWebsite(e.target.value)}
                          placeholder="https://acme.com" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.logoUrl")}</label>
                      <div style={{ position: "relative" }}>
                        <Link2 style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
                          placeholder="https://cdn.acme.com/logo.png" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.foundedDate")}</label>
                      <input type="date" value={foundedDate} onChange={e => setFoundedDate(e.target.value)}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.companyType")}</label>
                      <select value={companyType} onChange={e => setCompanyType(e.target.value)}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={selStyle}>
                        <option value="">{t("onboarding.su.selectType")}</option>
                        {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.city")}</label>
                      <input type="text" value={city} onChange={e => setCity(e.target.value)}
                        placeholder="San Francisco" onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.country")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                      <input type="text" value={country} onChange={e => setCountry(e.target.value)}
                        placeholder="United States" onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.industry")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                      <select value={industry} onChange={e => setIndustry(e.target.value)}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={selStyle}>
                        <option value="">{t("onboarding.su.selectIndustry")}</option>
                        {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.stage")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                      <select value={stage} onChange={e => setStage(e.target.value)}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={selStyle}>
                        <option value="">{t("onboarding.su.selectStage")}</option>
                        {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.businessModel")}</label>
                      <select value={businessModel} onChange={e => setBusinessModel(e.target.value)}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={selStyle}>
                        <option value="">{t("onboarding.su.selectModel")}</option>
                        {BUSINESS_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.revenueModel")}</label>
                      <select value={revenueModel} onChange={e => setRevenueModel(e.target.value)}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={selStyle}>
                        <option value="">{t("onboarding.su.howYouCharge")}</option>
                        {REVENUE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.teamSize")}</label>
                      <select value={teamSize} onChange={e => setTeamSize(e.target.value)}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={selStyle}>
                        <option value="">{t("onboarding.su.numEmployees")}</option>
                        {TEAM_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── STEP 2: Team ───────────────────────────────────── */}
              {step === 2 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.su.h2")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.su.h2Sub")}</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {founders.map((f, i) => (
                      <div key={i} style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", background: "var(--cr-paper-3)", position: "relative" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "12px", color: "var(--cr-copper)", flexShrink: 0 }}>
                              {i + 1}
                            </div>
                            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink-3)" }}>{t("onboarding.su.founderN", { n: i + 1 })}</span>
                          </div>
                          {founders.length > 1 && (
                            <button onClick={() => removeFounder(i)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)" }}>
                              <Trash2 style={{ width: 14, height: 14 }} />
                            </button>
                          )}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          <div>
                            <label style={labelSt}>{t("onboarding.su.fullName")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                            <input type="text" value={f.name} onChange={e => updateFounder(i, "name", e.target.value)}
                              placeholder="Jane Smith" style={iStyle} />
                          </div>
                          <div>
                            <label style={labelSt}>{t("onboarding.su.roleTitle")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                            <input type="text" value={f.role} onChange={e => updateFounder(i, "role", e.target.value)}
                              placeholder="CEO & Co-Founder" style={iStyle} />
                          </div>
                          <div>
                            <label style={labelSt}>{t("onboarding.su.linkedin")}</label>
                            <div style={{ position: "relative" }}>
                              <Linkedin style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "#0077B5" }} />
                              <input type="text" value={f.linkedin_url} onChange={e => updateFounder(i, "linkedin_url", e.target.value)}
                                placeholder="linkedin.com/in/…" style={{ ...iStyle, paddingLeft: "26px", fontSize: "13px" }} />
                            </div>
                          </div>
                          <div>
                            <label style={labelSt}>{t("onboarding.su.twitterX")}</label>
                            <div style={{ position: "relative" }}>
                              <Twitter style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "var(--cr-ink-4)" }} />
                              <input type="text" value={f.twitter_url} onChange={e => updateFounder(i, "twitter_url", e.target.value)}
                                placeholder="@handle" style={{ ...iStyle, paddingLeft: "26px", fontSize: "13px" }} />
                            </div>
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <label style={labelSt}>{t("onboarding.su.shortBio")}</label>
                            <textarea value={f.bio} onChange={e => updateFounder(i, "bio", e.target.value)} rows={3}
                              placeholder={t("onboarding.su.bioPh")}
                              style={{ ...taStyle, fontSize: "13px" }} />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button onClick={addFounder}
                      style={{
                        width: "100%", border: "2px dashed var(--cr-rule-dark)", borderRadius: "4px",
                        padding: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
                        color: "var(--cr-ink-4)", background: "transparent", cursor: "pointer",
                        transition: "border-color 120ms, color 120ms",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-4)"; }}>
                      <Plus style={{ width: 14, height: 14 }} /> {t("onboarding.su.addFounder")}
                    </button>
                  </div>
                </div>
              )}

              {/* ─── STEP 3: Pitch ──────────────────────────────────── */}
              {step === 3 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.su.h3")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.su.h3Sub")}</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div>
                      <label style={labelSt}>{t("onboarding.su.problem")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                      <p style={hintSt}>{t("onboarding.su.problemHint")}</p>
                      <textarea value={problem} onChange={e => setProblem(e.target.value)} rows={5}
                        placeholder="Healthcare providers spend 3+ hours per day on administrative documentation, leading to burnout and $18B in lost productivity annually."
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={taStyle} />
                    </div>
                    <div>
                      <label style={labelSt}>{t("onboarding.su.solution")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                      <p style={hintSt}>{t("onboarding.su.solutionHint")}</p>
                      <textarea value={solution} onChange={e => setSolution(e.target.value)} rows={5}
                        placeholder="Our AI automatically transcribes and codes clinical encounters in real-time, reducing documentation time by 70%."
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={taStyle} />
                    </div>
                    <div>
                      <label style={labelSt}>{t("onboarding.su.targetMarket")}</label>
                      <p style={hintSt}>{t("onboarding.su.marketHint")}</p>
                      <textarea value={market} onChange={e => setMarket(e.target.value)} rows={4}
                        placeholder="Primary: US independent physician practices (800K+ providers). TAM: $12B. Beachhead: rural clinics, $400M SAM."
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={taStyle} />
                    </div>
                    <div>
                      <label style={labelSt}>{t("onboarding.su.advantage")}</label>
                      <p style={hintSt}>{t("onboarding.su.advantageHint")}</p>
                      <textarea value={advantage} onChange={e => setAdvantage(e.target.value)} rows={4}
                        placeholder="Proprietary LLM fine-tuned on 2M+ clinical encounters. EHR integrations create high switching costs. HIPAA-compliant from day one."
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={taStyle} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px" }}>
                        <div>
                          <label style={labelSt}>{t("onboarding.su.competitors")}</label>
                          <p style={hintSt}>{t("onboarding.su.competitorsHint")}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {competitors.map((c, i) => (
                          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                            <input type="text" value={c.name} onChange={e => updateCompetitor(i, "name", e.target.value)}
                              placeholder={t("onboarding.su.competitorNamePh")} style={{ ...iStyle, width: "160px", flexShrink: 0, fontSize: "13px" }} />
                            <input type="text" value={c.differentiator} onChange={e => updateCompetitor(i, "differentiator", e.target.value)}
                              placeholder={t("onboarding.su.competitorDiffPh")} style={{ ...iStyle, flex: 1, fontSize: "13px" }} />
                            {competitors.length > 1 && (
                              <button onClick={() => removeCompetitor(i)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", paddingTop: "8px", flexShrink: 0 }}>
                                <Trash2 style={{ width: 14, height: 14 }} />
                              </button>
                            )}
                          </div>
                        ))}
                        <button onClick={addCompetitor}
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", alignSelf: "flex-start" }}>
                          <Plus style={{ width: 12, height: 12 }} /> {t("onboarding.su.addCompetitor")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── STEP 4: Traction ───────────────────────────────── */}
              {step === 4 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.su.h4")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.su.h4Sub")}</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div>
                        <label style={labelSt}>{t("onboarding.su.mrrUsd")}</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--cr-ink-4)" }}>$</span>
                          <input type="number" value={mrr} onChange={e => setMrr(e.target.value)}
                            placeholder="0" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingLeft: "22px" }} />
                        </div>
                      </div>
                      <div>
                        <label style={labelSt}>{t("onboarding.su.arrUsd")}</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--cr-ink-4)" }}>$</span>
                          <input type="number" value={arr} onChange={e => setArr(e.target.value)}
                            placeholder="0" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingLeft: "22px" }} />
                        </div>
                      </div>
                      <div>
                        <label style={labelSt}>{t("onboarding.su.totalUsers")}</label>
                        <input type="number" value={userCount} onChange={e => setUserCount(e.target.value)}
                          placeholder="0" onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                      </div>
                      <div>
                        <label style={labelSt}>{t("onboarding.su.payingCustomers")}</label>
                        <input type="number" value={payingCustomers} onChange={e => setPayingCustomers(e.target.value)}
                          placeholder="0" onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                      </div>
                      <div>
                        <label style={labelSt}>{t("onboarding.su.momGrowth")}</label>
                        <div style={{ position: "relative" }}>
                          <input type="number" value={growthRate} onChange={e => setGrowthRate(e.target.value)}
                            placeholder="0" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingRight: "28px" }} />
                          <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--cr-ink-4)" }}>%</span>
                        </div>
                      </div>
                      <div>
                        <label style={labelSt}>{t("onboarding.su.churn")}</label>
                        <div style={{ position: "relative" }}>
                          <input type="number" value={churnRate} onChange={e => setChurnRate(e.target.value)}
                            placeholder="0" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingRight: "28px" }} />
                          <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--cr-ink-4)" }}>%</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <label style={labelSt}>{t("onboarding.su.keyMilestones")}</label>
                        <button onClick={addMilestone}
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)" }}>
                          <Plus style={{ width: 12, height: 12 }} /> {t("onboarding.su.addMilestone")}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {milestones.map((m, i) => (
                          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input type="date" value={m.date} onChange={e => updateMilestone(i, "date", e.target.value)}
                              style={{ ...iStyle, width: "155px", flexShrink: 0, fontSize: "13px" }} />
                            <input type="text" value={m.description} onChange={e => updateMilestone(i, "description", e.target.value)}
                              placeholder={t("onboarding.su.milestonePh")} style={{ ...iStyle, flex: 1, fontSize: "13px" }} />
                            {milestones.length > 1 && (
                              <button onClick={() => removeMilestone(i)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", flexShrink: 0 }}>
                                <Trash2 style={{ width: 14, height: 14 }} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── STEP 5: The Ask ────────────────────────────────── */}
              {step === 5 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.su.h5")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.su.h5Sub")}</p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>{t("onboarding.su.fundingTarget")} <span style={{ color: "var(--cr-down)" }}>*</span></label>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--cr-ink-4)" }}>$</span>
                        <input type="number" value={fundingTarget} onChange={e => setFundingTarget(e.target.value)}
                          placeholder="2000000" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "22px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "16px" }} />
                      </div>
                    </div>
                    <div>
                      <label style={labelSt}>{t("onboarding.su.equityOffered")}</label>
                      <div style={{ position: "relative" }}>
                        <input type="number" value={equity} onChange={e => setEquity(e.target.value)}
                          placeholder="10" step="0.1" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingRight: "28px" }} />
                        <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--cr-ink-4)" }}>%</span>
                      </div>
                    </div>
                    <div>
                      <label style={labelSt}>{t("onboarding.su.minCheckSize")}</label>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--cr-ink-4)" }}>$</span>
                        <input type="number" value={minCheck} onChange={e => setMinCheck(e.target.value)}
                          placeholder="25000" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "22px" }} />
                      </div>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>{t("onboarding.su.runwayMonths")}</label>
                      <input type="number" value={runway} onChange={e => setRunway(e.target.value)}
                        placeholder="18" onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>{t("onboarding.su.useOfFunds")}</label>
                      <p style={hintSt}>{t("onboarding.su.useOfFundsHint")}</p>
                      <textarea value={useOfFunds} onChange={e => setUseOfFunds(e.target.value)} rows={4}
                        placeholder="40% engineering (3 new hires), 30% sales & marketing, 20% clinical partnerships, 10% legal & compliance"
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={taStyle} />
                    </div>
                  </div>

                  <div style={{ marginTop: "20px", background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.2)", borderRadius: "4px", padding: "14px 16px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-up)", lineHeight: 1.5 }}>
                      <strong>{t("onboarding.su.feeTitle")}</strong> {t("onboarding.su.feeBody")}
                    </p>
                  </div>
                </div>
              )}

              {/* ─── STEP 6: Documents ──────────────────────────────── */}
              {step === 6 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.su.h6")}</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>{t("onboarding.su.h6Sub")}</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ border: "2px dashed var(--cr-rule-dark)", borderRadius: "4px", padding: "32px", textAlign: "center" }}>
                      <Upload style={{ width: 28, height: 28, color: "var(--cr-ink-4)", margin: "0 auto 10px" }} />
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)", marginBottom: "4px" }}>{t("onboarding.su.uploadTitle")}</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>{t("onboarding.su.uploadSub")}</p>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.pitchDeckUrl")}</label>
                      <p style={hintSt}>{t("onboarding.su.pitchDeckHint")}</p>
                      <div style={{ position: "relative" }}>
                        <FileText style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={pitchDeckUrl} onChange={e => setPitchDeckUrl(e.target.value)}
                          placeholder="https://docsend.com/view/…" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.demoVideoUrl")}</label>
                      <p style={hintSt}>{t("onboarding.su.demoVideoHint")}</p>
                      <div style={{ position: "relative" }}>
                        <Link2 style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={demoVideoUrl} onChange={e => setDemoVideoUrl(e.target.value)}
                          placeholder="https://loom.com/share/…" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.productHuntUrl")}</label>
                      <div style={{ position: "relative" }}>
                        <Link2 style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#DA552F" }} />
                        <input type="text" value={productHuntUrl} onChange={e => setProductHuntUrl(e.target.value)}
                          placeholder="https://producthunt.com/posts/…" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>{t("onboarding.su.companyTwitter")}</label>
                      <div style={{ position: "relative" }}>
                        <Twitter style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={twitterUrl} onChange={e => setTwitterUrl(e.target.value)}
                          placeholder="@yourcompany or https://x.com/yourcompany" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── STEP 7: Plan ───────────────────────────────────── */}
              {step === 7 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("onboarding.su.h7")}</h2>
                  <p style={{ ...hintSt, marginBottom: "16px" }}>{t("onboarding.su.h7Sub")}</p>

                  <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px 16px", marginBottom: "20px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)", marginBottom: "10px" }}>{t("onboarding.su.unlocksTitle")}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      {[
                        ["Free", t("onboarding.su.unlockFree")],
                        ["Starter", t("onboarding.su.unlockStarter")],
                        ["Growth", t("onboarding.su.unlockGrowth")],
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
                        tier: "free", name: "Free", price: t("common.free"), highlight: false,
                        desc: t("onboarding.su.planFreeDesc"),
                        features: [t("onboarding.su.ff1"), t("onboarding.su.ff2"), t("onboarding.su.ff3"), t("onboarding.su.ff4")],
                        locked: [t("onboarding.su.fl1"), t("onboarding.su.fl2"), t("onboarding.su.fl3"), t("onboarding.su.fl4")],
                      },
                      {
                        tier: "starter", name: "Starter", price: "$19/mo", highlight: false,
                        desc: t("onboarding.su.planStarterDesc"),
                        features: [t("onboarding.su.sf1"), t("onboarding.su.sf2"), t("onboarding.su.sf3"), t("onboarding.su.sf4"), t("onboarding.su.sf5")],
                        locked: [t("onboarding.su.sl1"), t("onboarding.su.sl2"), t("onboarding.su.sl3"), t("onboarding.su.sl4")],
                      },
                      {
                        tier: "growth", name: "Growth", price: "$49/mo", highlight: true,
                        desc: t("onboarding.su.planGrowthDesc"),
                        features: [t("onboarding.su.gf1"), t("onboarding.su.gf2"), t("onboarding.su.gf3"), t("onboarding.su.gf4"), t("onboarding.su.gf5"), t("onboarding.su.gf6"), t("onboarding.su.gf7")],
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
                            onClick={async () => {
                              if (plan.tier === "free") { await handleSubmit(); }
                              else { await handleSubmit(); router.push(`/api/checkout/startup?tier=${plan.tier}`); }
                            }}
                            style={{ ...plan.highlight ? primaryBtn : outlineBtn, marginLeft: "16px", opacity: loading ? 0.5 : 1 }}>
                            {loading ? t("common.saving") : plan.tier === "free" ? t("onboarding.su.startFree") : t("onboarding.su.selectPlan", { name: plan.name })}
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
                {step < 7 && (
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
