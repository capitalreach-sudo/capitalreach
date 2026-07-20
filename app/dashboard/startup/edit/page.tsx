"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, Save, X } from "lucide-react";
import Link from "next/link";
import { INDUSTRIES, STAGES } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

// ── Constants ─────────────────────────────────────────────────────────────────

const BUSINESS_MODELS = ["B2B", "B2C", "B2B2C", "Marketplace", "SaaS", "Hardware", "Open Source + Enterprise", "Transactional", "Other"];
const REVENUE_MODELS  = ["Subscription", "Usage-based", "One-time", "Freemium", "Commission", "Advertising", "Licensing", "Services", "Other"];
const COMPANY_TYPES   = ["C-Corp", "LLC", "S-Corp", "PBC (Public Benefit Corp)", "Sole Proprietorship", "Not yet incorporated"];
const TEAM_SIZES      = ["Solo founder", "2–5", "6–10", "11–25", "26–50", "51–100", "100+"];
const DECK_LANGUAGES  = ["English", "German", "Both", "Other"];
const LOOKING_FOR_OPTIONS = [
  { value: "Capital",             labelKey: "dashboard.lf1" },
  { value: "Strategic investors", labelKey: "dashboard.lf2" },
  { value: "Board member",        labelKey: "dashboard.lf3" },
  { value: "Mentorship",          labelKey: "dashboard.lf4" },
  { value: "Co-founder",          labelKey: "dashboard.lf5" },
  { value: "Customers",           labelKey: "dashboard.lf6" },
];
const TARGET_MARKET_OPTIONS = [
  { value: "Germany", labelKey: "dashboard.tm1" },
  { value: "DACH",    labelKey: "dashboard.tm2" },
  { value: "Europe",  labelKey: "dashboard.tm3" },
  { value: "Global",  labelKey: "dashboard.tm4" },
  { value: "US",      labelKey: "dashboard.tm5" },
  { value: "UK",      labelKey: "dashboard.tm6" },
  { value: "Asia",    labelKey: "dashboard.tm7" },
];

// ── Shared form element styles ────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase",
  letterSpacing: "0.07em", marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300,
  fontSize: "14px", color: "var(--cr-ink)", padding: "9px 12px", outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: "vertical", minHeight: "90px", lineHeight: 1.6,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238B7355' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
  paddingRight: "30px", cursor: "pointer",
};

const sectionStyle: React.CSSProperties = {
  background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px", padding: "24px 28px",
};

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px",
  color: "var(--cr-ink)", marginBottom: "20px",
};

// ── TagInput ─────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (tags: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");

  function add() {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !input && tags.length > 0) onChange(tags.slice(0, -1));
  }

  return (
    <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "8px 10px", background: "var(--cr-paper-3)", display: "flex", flexWrap: "wrap", gap: "6px", minHeight: "42px", alignItems: "center" }}>
      {tags.map(tag => (
        <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", borderRadius: "3px", padding: "3px 8px" }}>
          {tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-copper)", display: "flex", padding: "0" }}>
            <X style={{ width: 10, height: 10 }} />
          </button>
        </span>
      ))}
      <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} onBlur={add}
        placeholder={tags.length === 0 ? (placeholder ?? "Type and press Enter…") : ""}
        style={{ flex: 1, minWidth: "120px", background: "transparent", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)" }} />
    </div>
  );
}

// ── WarmInput / WarmTextarea / WarmSelect ────────────────────────────────────

function WarmInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{ ...inputStyle, ...props.style }}
      onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
      onBlur={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")} />
  );
}

function WarmTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} style={{ ...textareaStyle, ...props.style }}
      onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
      onBlur={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")} />
  );
}

function WarmSelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  const { children, ...rest } = props;
  return (
    <select {...rest} style={{ ...selectStyle, ...rest.style }}
      onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
      onBlur={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}>
      {children}
    </select>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────

function WarmToggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "14px 16px", background: "var(--cr-paper-3)" }}>
      <div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)" }}>{label}</p>
        {hint && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "3px" }}>{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        style={{ width: 44, height: 24, borderRadius: "12px", border: "none", background: checked ? "var(--cr-copper)" : "var(--cr-paper-4)", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 150ms ease" }}>
        <span style={{ position: "absolute", top: "3px", left: checked ? "22px" : "3px", width: 18, height: 18, borderRadius: "9px", background: "#fff", transition: "left 150ms ease" }} />
      </button>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {hint && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "6px" }}>{hint}</p>}
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EditStartupPage() {
  const { t } = useTranslation();
  const [startup, setStartup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const router                = useRouter();
  const supabaseRef           = useRef(createClient());
  const supabase              = supabaseRef.current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const { data } = await supabase.from("startups").select("*").eq("owner_id", user.id).single();
      if (data) data.competitors_json = Array.isArray(data.competitors_json) ? data.competitors_json : [];
      setStartup(data);
      setLoading(false);
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("startups").update({
      name: startup.name, tagline: startup.tagline, website: startup.website || null,
      industry: startup.industry, stage: startup.stage, country: startup.country,
      problem: startup.problem, solution: startup.solution, market: startup.market,
      competitive_advantage: startup.competitive_advantage,
      funding_target: parseInt(startup.funding_target) || 0,
      equity_offered: parseFloat(startup.equity_offered) || null,
      min_check_size: parseInt(startup.min_check_size) || null,
      use_of_funds: startup.use_of_funds || null,
      mrr: parseInt(startup.mrr) || null, arr: parseInt(startup.arr) || null,
      user_count: parseInt(startup.user_count) || null,
      growth_rate: parseFloat(startup.growth_rate) || null,
      demo_video_url: startup.demo_video_url || null,
      require_nda: !!startup.require_nda,
      founded_date: startup.founded_date || null, city: startup.city || null,
      business_model: startup.business_model || null,
      revenue_model: startup.revenue_model || null,
      team_size: startup.team_size || null, company_type: startup.company_type || null,
      churn_rate: parseFloat(startup.churn_rate) || null,
      paying_customers: parseInt(startup.paying_customers) || null,
      pitch_deck_url: startup.pitch_deck_url || null,
      product_hunt_url: startup.product_hunt_url || null,
      twitter_url: startup.twitter_url || null,
      runway_months: parseInt(startup.runway_months) || null,
      competitors_json:  startup.competitors_json || [],
      target_markets:    startup.target_markets || null,
      languages:         startup.languages || null,
      previous_funding:  parseFloat(startup.previous_funding) || null,
      lead_investor:     startup.lead_investor || null,
      deck_language:     startup.deck_language || null,
      video_pitch_url:   startup.video_pitch_url || null,
      looking_for:       startup.looking_for || null,
      status: startup.status === "active" ? "pending_review" : startup.status,
    }).eq("id", startup.id);

    if (error) { notify.error(error.message); }
    else { notify.success(t("dashboard.editChangesSubmitted")); router.push("/dashboard/startup"); }
    setSaving(false);
  }

  function update(field: string, value: any) { setStartup((s: any) => ({ ...s, [field]: value })); }

  if (loading) return (
    <><Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>
        {t("common.loading")}
      </div>
    </>
  );

  if (!startup) return (
    <><Navbar />
      <div style={{ textAlign: "center", padding: "80px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>
        {t("dashboard.editNoStartup")} <Link href="/onboarding/startup" style={{ color: "var(--cr-copper)" }}>{t("dashboard.editCreateOne")} →</Link>
      </div>
    </>
  );

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "100vh", paddingBottom: "60px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px" }}>

          {/* Back + Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
            <Link href="/dashboard/startup" style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", textDecoration: "none" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-4)")}>
              <ArrowLeft style={{ width: 14, height: 14 }} /> {t("common.back")}
            </Link>
            <div style={{ width: 1, height: 14, background: "var(--cr-rule-dark)" }} />
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "24px", color: "var(--cr-ink)", letterSpacing: "-0.02em" }}>{t("dashboard.editProfile")}</h1>
          </div>

          {/* Review notice */}
          <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(180,83,9,0.2)", borderRadius: "4px", padding: "12px 16px", marginBottom: "28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#B45309" }}>
            {t("dashboard.editReviewNotice")}
          </div>

          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Company Basics */}
            <section style={sectionStyle}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secCompanyBasics")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("onboarding.su.companyName")}><WarmInput value={startup.name || ""} onChange={e => update("name", e.target.value)} /></Field>
                <Field label={t("onboarding.su.tagline")}><WarmInput value={startup.tagline || ""} onChange={e => update("tagline", e.target.value)} /></Field>
                <Field label={t("onboarding.su.website")}><WarmInput value={startup.website || ""} onChange={e => update("website", e.target.value)} placeholder="https://…" /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <Field label={t("onboarding.su.industry")}>
                    <WarmSelect value={startup.industry || ""} onChange={e => update("industry", e.target.value)}>
                      <option value="">{t("onboarding.su.selectIndustry")}</option>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </WarmSelect>
                  </Field>
                  <Field label={t("onboarding.su.stage")}>
                    <WarmSelect value={startup.stage || ""} onChange={e => update("stage", e.target.value)}>
                      <option value="">{t("onboarding.su.selectStage")}</option>
                      {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </WarmSelect>
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <Field label={t("onboarding.su.country")}><WarmInput value={startup.country || ""} onChange={e => update("country", e.target.value)} /></Field>
                  <Field label={t("onboarding.su.city")}><WarmInput value={startup.city || ""} onChange={e => update("city", e.target.value)} placeholder="San Francisco" /></Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <Field label={t("onboarding.su.foundedDate")}><WarmInput type="date" value={startup.founded_date || ""} onChange={e => update("founded_date", e.target.value)} /></Field>
                  <Field label={t("onboarding.su.companyType")}>
                    <WarmSelect value={startup.company_type || ""} onChange={e => update("company_type", e.target.value)}>
                      <option value="">{t("onboarding.su.selectType")}</option>
                      {COMPANY_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                    </WarmSelect>
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <Field label={t("onboarding.su.teamSize")}>
                    <WarmSelect value={startup.team_size || ""} onChange={e => update("team_size", e.target.value)}>
                      <option value="">{t("onboarding.su.numEmployees")}</option>
                      {TEAM_SIZES.map(ts => <option key={ts} value={ts}>{ts}</option>)}
                    </WarmSelect>
                  </Field>
                  <Field label={t("onboarding.su.companyTwitter")}><WarmInput value={startup.twitter_url || ""} onChange={e => update("twitter_url", e.target.value)} placeholder="https://x.com/…" /></Field>
                </div>
              </div>
            </section>

            {/* Business Model */}
            <section style={sectionStyle}>
              <h2 style={sectionHeadStyle}>{t("onboarding.su.businessModel")}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <Field label={t("onboarding.su.businessModel")}>
                  <WarmSelect value={startup.business_model || ""} onChange={e => update("business_model", e.target.value)}>
                    <option value="">{t("dashboard.selectDots")}</option>
                    {BUSINESS_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </WarmSelect>
                </Field>
                <Field label={t("onboarding.su.revenueModel")}>
                  <WarmSelect value={startup.revenue_model || ""} onChange={e => update("revenue_model", e.target.value)}>
                    <option value="">{t("dashboard.selectDots")}</option>
                    {REVENUE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </WarmSelect>
                </Field>
              </div>
            </section>

            {/* Pitch */}
            <section style={sectionStyle}>
              <h2 style={sectionHeadStyle}>{t("onboarding.su.step3")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("onboarding.su.problem")}><WarmTextarea value={startup.problem || ""} onChange={e => update("problem", e.target.value)} /></Field>
                <Field label={t("onboarding.su.solution")}><WarmTextarea value={startup.solution || ""} onChange={e => update("solution", e.target.value)} /></Field>
                <Field label={t("onboarding.su.targetMarket")}><WarmTextarea value={startup.market || ""} onChange={e => update("market", e.target.value)} /></Field>
                <Field label={t("onboarding.su.advantage")}><WarmTextarea value={startup.competitive_advantage || ""} onChange={e => update("competitive_advantage", e.target.value)} /></Field>
                <Field label={t("onboarding.su.competitors")} hint={t("dashboard.competitorsHintEnter")}>
                  <TagInput tags={startup.competitors_json || []} onChange={tags => update("competitors_json", tags)} placeholder={t("onboarding.su.competitorNamePh")} />
                </Field>
              </div>
            </section>

            {/* Traction & Metrics */}
            <section style={sectionStyle}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secTraction")}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <Field label={t("onboarding.su.mrrUsd")}><WarmInput type="number" value={startup.mrr || ""} onChange={e => update("mrr", e.target.value)} /></Field>
                <Field label={t("onboarding.su.arrUsd")}><WarmInput type="number" value={startup.arr || ""} onChange={e => update("arr", e.target.value)} /></Field>
                <Field label={t("onboarding.su.totalUsers")}><WarmInput type="number" value={startup.user_count || ""} onChange={e => update("user_count", e.target.value)} /></Field>
                <Field label={t("onboarding.su.momGrowth")}><WarmInput type="number" value={startup.growth_rate || ""} onChange={e => update("growth_rate", e.target.value)} /></Field>
                <Field label={t("onboarding.su.payingCustomers")}><WarmInput type="number" value={startup.paying_customers || ""} onChange={e => update("paying_customers", e.target.value)} /></Field>
                <Field label={t("onboarding.su.churn")}><WarmInput type="number" step="0.1" value={startup.churn_rate || ""} onChange={e => update("churn_rate", e.target.value)} /></Field>
                <Field label={t("onboarding.su.runwayMonths")}><WarmInput type="number" value={startup.runway_months || ""} onChange={e => update("runway_months", e.target.value)} /></Field>
              </div>
            </section>

            {/* The Ask */}
            <section style={sectionStyle}>
              <h2 style={sectionHeadStyle}>{t("onboarding.su.step5")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("onboarding.su.fundingTarget")}><WarmInput type="number" value={startup.funding_target || ""} onChange={e => update("funding_target", e.target.value)} /></Field>
                <Field label={t("onboarding.su.equityOffered")}><WarmInput type="number" step="0.1" value={startup.equity_offered || ""} onChange={e => update("equity_offered", e.target.value)} /></Field>
                <Field label={t("onboarding.su.minCheckSize")}><WarmInput type="number" value={startup.min_check_size || ""} onChange={e => update("min_check_size", e.target.value)} /></Field>
                <Field label={t("onboarding.su.useOfFunds")}><WarmTextarea value={startup.use_of_funds || ""} onChange={e => update("use_of_funds", e.target.value)} /></Field>
              </div>
            </section>

            {/* Links & Assets */}
            <section style={sectionStyle}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secLinks")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("onboarding.su.pitchDeckUrl")} hint={t("dashboard.pitchDeckHint2")}>
                  <WarmInput value={startup.pitch_deck_url || ""} onChange={e => update("pitch_deck_url", e.target.value)} placeholder="https://docsend.com/…" />
                </Field>
                <Field label={t("dashboard.pitchVideoUrl")} hint={t("dashboard.pitchVideoHint")}>
                  <WarmInput value={startup.video_pitch_url || ""} onChange={e => update("video_pitch_url", e.target.value)} placeholder="https://youtube.com/watch?v=… or loom.com/share/…" />
                </Field>
                <Field label={t("onboarding.su.demoVideoUrl")}>
                  <WarmInput value={startup.demo_video_url || ""} onChange={e => update("demo_video_url", e.target.value)} placeholder="https://youtube.com/watch?v=…" />
                </Field>
                <Field label={t("onboarding.su.productHuntUrl")}>
                  <WarmInput value={startup.product_hunt_url || ""} onChange={e => update("product_hunt_url", e.target.value)} placeholder="https://producthunt.com/posts/…" />
                </Field>
              </div>
            </section>

            {/* Visibility & Outreach */}
            <section style={sectionStyle}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secVisibility")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("dashboard.lookingFor")} hint={t("dashboard.lookingForHint")}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {LOOKING_FOR_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => {
                          const cur: string[] = startup.looking_for || [];
                          update("looking_for", cur.includes(opt.value) ? cur.filter((x: string) => x !== opt.value) : [...cur, opt.value]);
                        }}
                        style={{
                          fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
                          padding: "6px 14px", borderRadius: "3px", cursor: "pointer",
                          border: (startup.looking_for || []).includes(opt.value) ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
                          background: (startup.looking_for || []).includes(opt.value) ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                          color: (startup.looking_for || []).includes(opt.value) ? "var(--cr-copper)" : "var(--cr-ink-3)",
                        }}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={t("dashboard.targetMarketsLabel")} hint={t("dashboard.targetMarketsHint")}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {TARGET_MARKET_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => {
                          const cur: string[] = startup.target_markets || [];
                          update("target_markets", cur.includes(opt.value) ? cur.filter((x: string) => x !== opt.value) : [...cur, opt.value]);
                        }}
                        style={{
                          fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
                          padding: "6px 14px", borderRadius: "3px", cursor: "pointer",
                          border: (startup.target_markets || []).includes(opt.value) ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
                          background: (startup.target_markets || []).includes(opt.value) ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                          color: (startup.target_markets || []).includes(opt.value) ? "var(--cr-copper)" : "var(--cr-ink-3)",
                        }}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={t("dashboard.deckLanguage")}>
                  <WarmSelect value={startup.deck_language || ""} onChange={e => update("deck_language", e.target.value)}>
                    <option value="">{t("dashboard.selectDots")}</option>
                    {DECK_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </WarmSelect>
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <Field label={t("dashboard.leadInvestor")} hint={t("dashboard.leadInvestorHint")}>
                    <WarmInput value={startup.lead_investor || ""} onChange={e => update("lead_investor", e.target.value)} placeholder="e.g. Sequoia Capital" />
                  </Field>
                  <Field label={t("dashboard.prevFunding")} hint={t("dashboard.prevFundingHint")}>
                    <WarmInput type="number" value={startup.previous_funding || ""} onChange={e => update("previous_funding", e.target.value)} placeholder="0" />
                  </Field>
                </div>
                <Field label={t("dashboard.teamLanguages")} hint={t("dashboard.teamLanguagesHint")}>
                  <TagInput tags={startup.languages || []} onChange={tags => update("languages", tags)} placeholder="English, German, French…" />
                </Field>
              </div>
            </section>

            {/* Settings */}
            <section style={sectionStyle}>
              <h2 style={sectionHeadStyle}>{t("dashboard.settings")}</h2>
              <WarmToggle
                checked={!!startup.require_nda}
                onChange={v => update("require_nda", v)}
                label={t("dashboard.ndaToggle")}
                hint={t("dashboard.ndaToggleHint")}
              />
            </section>

            {/* Submit */}
            <button type="submit" disabled={saving}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", height: "48px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              <Save style={{ width: 16, height: 16 }} />
              {saving ? t("common.saving") : t("dashboard.saveAll")}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
