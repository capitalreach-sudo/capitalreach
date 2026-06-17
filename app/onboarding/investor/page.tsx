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
  { id: 1, label: "Investor Type", icon: Users,      desc: "What kind of investor?" },
  { id: 2, label: "Preferences",   icon: Settings,   desc: "What you look for"      },
  { id: 3, label: "Your Profile",  icon: User,       desc: "About you & your firm"  },
  { id: 4, label: "Portfolio",     icon: Building2,  desc: "Track record & style"   },
  { id: 5, label: "Accreditation", icon: ShieldCheck,desc: "Legal certification"    },
  { id: 6, label: "Membership",    icon: CreditCard, desc: "Choose your plan"       },
];

const INVESTOR_TYPES = [
  { value: "angel",       label: "Angel Investor",         desc: "Individual writing personal checks, typically $10K–$250K",              emoji: "👼" },
  { value: "vc",          label: "Venture Capital",         desc: "Institutional fund deploying LP capital, typically $500K+",             emoji: "🏢" },
  { value: "family_office",label: "Family Office",          desc: "Private wealth management for high-net-worth families",                emoji: "🏡" },
  { value: "corporate",   label: "Corporate VC / Strategic",desc: "Investment arm of a corporation seeking strategic alignment",           emoji: "🏭" },
] as const;

const AUM_RANGES = [
  "< $1M", "$1M – $5M", "$5M – $25M", "$25M – $100M",
  "$100M – $500M", "$500M – $1B", "$1B+",
];
const FOLLOW_ON_OPTIONS = [
  { value: "yes",       label: "Yes — I actively reserve capital for follow-ons"      },
  { value: "sometimes", label: "Case-by-case — depends on performance"                },
  { value: "no",        label: "No — I only lead or participate in initial rounds"    },
];
const BOARD_OPTIONS = [
  { value: "actively_seek",  label: "Actively seek board seats"       },
  { value: "open",           label: "Open to board or observer roles" },
  { value: "no_preference",  label: "No preference — passive investor"},
  { value: "no",             label: "Prefer not to take board seats"  },
];

interface PortfolioCompany { name: string; stage: string; year: string; }

export default function InvestorOnboardingPage() {
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
      notify.error("Error creating profile: " + (error?.message || "Unknown error"));
      setLoading(false); return;
    }
    await supabase.from("profiles").update({
      accreditation_certified: accredited && accreditedDeclaration,
      ...(displayName ? { full_name: displayName } : {}),
    }).eq("id", user.id);

    if (tier !== "free") {
      router.push(`/api/checkout/investor?tier=${tier}`);
    } else {
      notify.success("Profile created! Start discovering startups on CapitalReach.");
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
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginLeft: "4px" }}>for investors</span>
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
              <p style={{ ...labelSt, marginBottom: "16px", paddingLeft: "12px" }}>Steps</p>
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
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", lineHeight: 1.2, color: active ? "var(--cr-copper)" : done ? "var(--cr-ink)" : "var(--cr-ink-4)" }}>{s.label}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: active ? "var(--cr-copper)" : "var(--cr-ink-4)" }}>{s.desc}</p>
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
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>What type of investor are you?</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>This helps us tailor your experience and match you to the right deal flow.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {INVESTOR_TYPES.map(t => (
                      <button key={t.value} onClick={() => setInvestorType(t.value)}
                        style={{
                          width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: "16px",
                          padding: "18px 20px", borderRadius: "4px",
                          border: investorType === t.value ? "2px solid var(--cr-copper)" : "2px solid var(--cr-rule-dark)",
                          background: investorType === t.value ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                          cursor: "pointer", transition: "all 120ms ease",
                        }}>
                        <span style={{ fontSize: "28px", flexShrink: 0 }}>{t.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "3px" }}>{t.label}</p>
                          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)" }}>{t.desc}</p>
                        </div>
                        {investorType === t.value && <CheckCircle2 style={{ width: 18, height: 18, color: "var(--cr-copper)", flexShrink: 0, marginTop: "2px" }} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── STEP 2: Preferences ─────────────────────────────── */}
              {step === 2 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>Investment preferences</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>We use these to surface the most relevant startups for you.</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div>
                      <label style={labelSt}>Industries (select all that apply)</label>
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
                      <label style={labelSt}>Preferred Stages</label>
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
                        <label style={labelSt}>Min Check Size (USD)</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>$</span>
                          <input type="number" value={minCheck} onChange={e => setMinCheck(e.target.value)}
                            placeholder="10,000" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingLeft: "24px" }} />
                        </div>
                      </div>
                      <div>
                        <label style={labelSt}>Max Check Size (USD)</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>$</span>
                          <input type="number" value={maxCheck} onChange={e => setMaxCheck(e.target.value)}
                            placeholder="500,000" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingLeft: "24px" }} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>Geography Focus</label>
                      <p style={hintSt}>Comma-separated regions or countries</p>
                      <input type="text" value={geography} onChange={e => setGeography(e.target.value)}
                        placeholder="United States, United Kingdom, Global"
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", padding: "14px 16px", borderRadius: "4px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)" }}>
                      <input type="checkbox" checked={leadRounds} onChange={e => setLeadRounds(e.target.checked)}
                        style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
                      <div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "2px" }}>I lead rounds</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>I&apos;m willing to be the lead investor and set terms</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* ─── STEP 3: Profile ─────────────────────────────────── */}
              {step === 3 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>Your profile</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>Startups will see this when you reach out. Be specific about your background.</p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <label style={labelSt}>Your Full Name</label>
                      <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                        placeholder="Sarah Chen" onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    {(investorType === "vc" || investorType === "family_office" || investorType === "corporate") && (
                      <div>
                        <label style={labelSt}>Firm / Fund Name</label>
                        <div style={{ position: "relative" }}>
                          <Building2 style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                          <input type="text" value={firmName} onChange={e => setFirmName(e.target.value)}
                            placeholder="Sequoia Capital" onFocus={onFocusCopper} onBlur={onBlurRule}
                            style={{ ...iStyle, paddingLeft: "30px" }} />
                        </div>
                      </div>
                    )}

                    <div>
                      <label style={labelSt}>AUM / Fund Size</label>
                      <select value={aum} onChange={e => setAum(e.target.value)}
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={selStyle}>
                        <option value="">Select range</option>
                        {AUM_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={labelSt}>Number of Investments Made</label>
                      <input type="number" value={numberOfInvestments} onChange={e => setNumberOfInvestments(e.target.value)}
                        placeholder="e.g. 24" onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>

                    <div>
                      <label style={labelSt}>Website</label>
                      <div style={{ position: "relative" }}>
                        <Globe style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={website} onChange={e => setWebsite(e.target.value)}
                          placeholder="https://sarahchen.vc" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>LinkedIn</label>
                      <div style={{ position: "relative" }}>
                        <Linkedin style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#0077B5" }} />
                        <input type="text" value={linkedin} onChange={e => setLinkedin(e.target.value)}
                          placeholder="linkedin.com/in/…" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>Twitter / X</label>
                      <div style={{ position: "relative" }}>
                        <Twitter style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--cr-ink-4)" }} />
                        <input type="text" value={twitter} onChange={e => setTwitter(e.target.value)}
                          placeholder="@sarahchen" onFocus={onFocusCopper} onBlur={onBlurRule}
                          style={{ ...iStyle, paddingLeft: "30px" }} />
                      </div>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>Short Bio <span style={{ color: "var(--cr-down)" }}>*</span></label>
                      <p style={hintSt}>Tell founders who you are and what you bring beyond capital.</p>
                      <textarea value={bio} onChange={e => setBio(e.target.value)} rows={5}
                        placeholder="Angel investor focused on HealthTech and B2B SaaS. Former CMO at Stripe. Led 30+ investments at pre-seed and seed. Board member at 4 portfolio companies."
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={taStyle} />
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>Investment Thesis</label>
                      <p style={hintSt}>What patterns, missions, or founders do you get excited about?</p>
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
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>Portfolio & investing style</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>Share your track record and how you work with portfolio companies.</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <div>
                          <label style={labelSt}>Notable Portfolio Companies</label>
                          <p style={hintSt}>Up to 10 companies you&apos;ve invested in</p>
                        </div>
                        {portfolioCompanies.length < 10 && (
                          <button onClick={addPortfolioCompany}
                            style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)" }}>
                            <Plus style={{ width: 13, height: 13 }} /> Add company
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {portfolioCompanies.map((co, i) => (
                          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input type="text" value={co.name} onChange={e => updatePortfolioCompany(i, "name", e.target.value)}
                              placeholder="Company name" style={{ ...iStyle, flex: 1 }} />
                            <select value={co.stage} onChange={e => updatePortfolioCompany(i, "stage", e.target.value)}
                              style={{ ...selStyle, width: "130px" }}>
                              <option value="">Stage</option>
                              {["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "IPO", "Acquired"].map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <input type="number" value={co.year} onChange={e => updatePortfolioCompany(i, "year", e.target.value)}
                              placeholder="Year" style={{ ...iStyle, width: "80px" }} />
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
                      <label style={labelSt}>Follow-on Investment Policy</label>
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
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>Board Seat Preference</label>
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
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={labelSt}>Average Hold Period</label>
                      <input type="text" value={avgHoldPeriod} onChange={e => setAvgHoldPeriod(e.target.value)}
                        placeholder="e.g. 5–7 years, until exit or IPO"
                        onFocus={onFocusCopper} onBlur={onBlurRule} style={iStyle} />
                    </div>
                  </div>
                </div>
              )}

              {/* ─── STEP 5: Accreditation ───────────────────────────── */}
              {step === 5 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>Investor accreditation</h2>
                  <p style={{ ...hintSt, marginBottom: "24px" }}>Required by securities regulations in most jurisdictions to access private investment opportunities.</p>

                  <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "16px 18px", marginBottom: "24px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <ShieldCheck style={{ width: 18, height: 18, color: "var(--cr-copper)", flexShrink: 0, marginTop: "1px" }} />
                    <div>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", marginBottom: "4px" }}>Legal requirement</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-copper)", lineHeight: 1.5 }}>
                        To access full startup profiles, financial data, pitch decks, and direct communication with founders, you must self-certify as an accredited investor under applicable securities law.
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
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "6px" }}>I am an accredited investor</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          I certify that I meet one of the following criteria: (a) net worth exceeding $1M excluding primary residence, (b) annual income exceeding $200K ($300K jointly with spouse) for the past two years with reasonable expectation of the same this year, or (c) I am a licensed investment professional (Series 65, 82, or equivalent).
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
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "6px" }}>I understand the risks</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
                          I understand that investments in early-stage private companies are highly speculative, illiquid, and involve significant risk of loss. I may lose my entire investment. I am making investment decisions independently and am not relying on CapitalReach for investment advice.
                        </p>
                      </div>
                    </label>

                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textAlign: "center" }}>
                      This self-certification is stored securely and may be subject to verification for institutional members.
                    </p>
                  </div>
                </div>
              )}

              {/* ─── STEP 6: Membership ──────────────────────────────── */}
              {step === 6 && (
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)", marginBottom: "6px" }}>Choose your membership</h2>
                  <p style={{ ...hintSt, marginBottom: "16px" }}>Unlock more deal flow, AI tools, and direct access to founders.</p>

                  <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px 16px", marginBottom: "20px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)", marginBottom: "10px" }}>What each plan unlocks:</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      {[
                        ["Free", "Browse startup cards only"],
                        ["Angel", "Full profiles, financials, messaging"],
                        ["Pro", "AI due diligence + unlimited messaging"],
                        ["Institutional", "API access + dedicated team"],
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
                        tier: "free", name: "Explorer", price: "Free", highlight: false,
                        desc: "Browse the marketplace and see startup cards.",
                        features: ["Browse startup cards", "See name, tagline, industry, stage", "Use AI pitch analyzer & matching tools"],
                        locked: ["Full startup profiles & financials", "Pitch deck access", "Messaging with founders", "Watchlists & deal tracking"],
                      },
                      {
                        tier: "angel", name: "Angel", price: "$99/mo", highlight: false,
                        desc: "Full startup profiles and direct messaging.",
                        features: ["Full startup profiles & financials", "Pitch deck & document access", "Direct messaging (5 threads/mo)", "Saved watchlists", "AI score access"],
                        locked: ["AI due diligence reports", "Unlimited messaging", "CSV data export", "Weekly deal flow digest"],
                      },
                      {
                        tier: "pro_investor", name: "Pro", price: "$299/mo", highlight: true,
                        desc: "The full deal flow experience with AI superpowers.",
                        features: ["Everything in Angel", "Unlimited messaging", "AI due diligence reports included", "Weekly curated deal flow digest", "CSV data export", "Early access to new deals"],
                        locked: [],
                      },
                      {
                        tier: "institutional", name: "Institutional", price: "Custom", highlight: false,
                        desc: "Unlimited access, integrations, and a dedicated team.",
                        features: ["Everything in Pro", "API access & CRM integrations", "Dedicated relationship manager", "SLA & compliance support", "Custom reporting"],
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
                            <span style={{ background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "10px", padding: "3px 8px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Most Popular</span>
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
                            {plan.tier === "institutional" ? "Contact Sales" : plan.tier === "free" ? "Start Free" : `Select ${plan.name}`}
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
                    <ChevronLeft style={{ width: 14, height: 14 }} /> Back
                  </button>
                )}
                {step < 6 && (
                  <button style={{ ...primaryBtn, flex: 1, justifyContent: "center", opacity: !canNext() ? 0.4 : 1, cursor: !canNext() ? "not-allowed" : "pointer" }}
                    onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                    Continue <ChevronRight style={{ width: 14, height: 14 }} />
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
