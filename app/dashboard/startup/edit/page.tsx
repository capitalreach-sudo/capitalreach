"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { COUNTRIES, normalizeCountry } from "@/lib/countries";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, Save, X, Check, Loader2 } from "lucide-react";
import { listingCompleteness } from "@/lib/listing-completeness";
import Link from "next/link";
import { INDUSTRIES, STAGES } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { InfoTip } from "@/components/shared/info-tip";

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

function Field({ label, children, hint, termKey }: { label: string; children: React.ReactNode; hint?: string; termKey?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}{termKey && <InfoTip termKey={termKey} />}</label>
      {hint && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "6px" }}>{hint}</p>}
      {children}
    </div>
  );
}

// ── Milestones ────────────────────────────────────────────────────────────────
//
// Onboarding could create milestones; until this section nothing after it
// could, even though the dashboard checklist asks for one. Self-contained:
// reads via the RLS client (milestones are public on the profile anyway),
// writes through /api/milestones so adding one also notifies savers.
function MilestonesSection({ startupId, supabase }: { startupId: string; supabase: ReturnType<typeof createClient> }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Array<{ id: string; date: string; description: string }>>([]);
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("startup_milestones").select("id, date, description")
      .eq("startup_id", startupId).order("date", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, [startupId, supabase]);

  async function add() {
    if (!date || !description.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/milestones", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, description: description.trim() }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !json?.milestone) { notify.error(json?.error || t("dashboard.msAddFailed")); return; }
    setRows((r) => [json.milestone, ...r]);
    setDate(""); setDescription("");
    notify.success(t("dashboard.msAdded"));
  }

  async function remove(id: string) {
    const res = await fetch("/api/milestones", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((r) => r.filter((m) => m.id !== id));
  }

  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadStyle}>{t("dashboard.secMilestones")}</h2>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "14px" }}>
        {t("dashboard.msBroadcastHint")}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: rows.length ? "16px" : 0 }}>
        {rows.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "baseline", gap: "10px", borderBottom: "1px solid var(--cr-rule)", paddingBottom: "8px" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>{m.date}</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-2)", flex: 1 }}>{m.description}</span>
            <button type="button" onClick={() => remove(m.id)} aria-label={t("dashboard.msRemove")}
              style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      <div className="milestone-row" style={{ gap: "10px", alignItems: "end" }}>
        <Field label={t("dashboard.msDate")}><WarmInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t("dashboard.msWhat")}><WarmInput value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder={t("dashboard.msPlaceholder")} /></Field>
        <button type="button" onClick={add} disabled={busy || !date || !description.trim()}
          style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", padding: "10px 16px", cursor: busy ? "wait" : "pointer", height: "fit-content" }}>
          {busy ? "…" : t("dashboard.msAdd")}
        </button>
      </div>
    </section>
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
      // A local backup newer than the database (tab closed mid-edit) is
      // restored — the founder loses nothing.
      if (data) {
        try {
          const raw = localStorage.getItem(`cr_edit_backup_${data.id}`);
          if (raw) {
            const b = JSON.parse(raw);
            if (b?.at && b.startup && b.at > new Date(data.updated_at ?? 0).getTime()) {
              setStartup({ ...b.startup, id: data.id, status: data.status, updated_at: data.updated_at });
              dirty.current = true;
              setLoading(false);
              return;
            }
          }
        } catch { /* corrupt backup — ignore */ }
      }
      setStartup(data);
      setLoading(false);
    })();
  }, []);

  // The column payload the form owns. Built once, used by both autosave and
  // the explicit Save so the two can never diverge.
  function buildPayload(st: any) {
    return {
      name: st.name, tagline: st.tagline, website: st.website || null,
      booking_url: st.booking_url || null,
      industry: st.industry, stage: st.stage, country: st.country,
      problem: st.problem, solution: st.solution, market: st.market,
      competitive_advantage: st.competitive_advantage,
      funding_target: parseInt(st.funding_target) || 0,
      equity_offered: parseFloat(st.equity_offered) || null,
      min_check_size: parseInt(st.min_check_size) || null,
      use_of_funds: st.use_of_funds || null,
      round_close_date: st.round_close_date || null,
      mrr: parseInt(st.mrr) || null, arr: parseInt(st.arr) || null,
      user_count: parseInt(st.user_count) || null,
      growth_rate: parseFloat(st.growth_rate) || null,
      demo_video_url: st.demo_video_url || null,
      require_nda: !!st.require_nda,
      founded_date: st.founded_date || null, city: st.city || null,
      business_model: st.business_model || null,
      revenue_model: st.revenue_model || null,
      team_size: st.team_size || null, company_type: st.company_type || null,
      churn_rate: parseFloat(st.churn_rate) || null,
      paying_customers: parseInt(st.paying_customers) || null,
      pitch_deck_url: st.pitch_deck_url || null,
      product_hunt_url: st.product_hunt_url || null,
      twitter_url: st.twitter_url || null,
      runway_months: parseInt(st.runway_months) || null,
      competitors_json:  st.competitors_json || [],
      target_markets:    st.target_markets || null,
      languages:         st.languages || null,
      previous_funding:  parseFloat(st.previous_funding) || null,
      lead_investor:     st.lead_investor || null,
      deck_language:     st.deck_language || null,
      video_pitch_url:   st.video_pitch_url || null,
      looking_for:       st.looking_for || null,
      tam: parseFloat(st.tam) || null, sam: parseFloat(st.sam) || null, som: parseFloat(st.som) || null,
      // D44: the round's own numbers.
      valuation: parseFloat(st.valuation) || null,
      valuation_type: st.valuation_type || null,
      instrument: st.instrument || null,
      safe_cap: parseFloat(st.safe_cap) || null,
      safe_discount: parseFloat(st.safe_discount) || null,
      // A live listing STAYS live when edited. It used to flip back to
      // pending_review — a founder fixing a typo vanished from the market
      // until re-approved. Instead the edit is stamped for admin re-check.
      ...(st.status === "active" ? { edited_since_review_at: new Date().toISOString() } : {}),
    };
  }

  // Autosave: 1s after the last change, silently; "Saving… / Saved ✓" in
  // the header. localStorage keeps a copy on each change so a closed tab
  // loses nothing; it is restored on load if newer than the DB row.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = useRef(false);
  const lastSaved = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backupKey = startup?.id ? `cr_edit_backup_${startup.id}` : null;

  const persist = useCallback(async (st: any, opts: { retry?: boolean } = {}): Promise<boolean> => {
    const payload = buildPayload(st);
    const sig = JSON.stringify(payload);
    if (sig === lastSaved.current) { setSaveState("saved"); return true; }
    setSaveState("saving");
    const { error } = await supabase.from("startups").update(payload).eq("id", st.id);
    if (error) {
      if (!opts.retry) return persist(st, { retry: true });
      setSaveState("error");
      return false;
    }
    lastSaved.current = sig;
    dirty.current = false;
    try { if (backupKey) localStorage.removeItem(backupKey); } catch { /* ignore */ }
    setSaveState("saved");
    setTimeout(() => setSaveState((v) => (v === "saved" ? "idle" : v)), 2000);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, backupKey]);

  useEffect(() => {
    if (!startup || loading || !dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    try { if (backupKey) localStorage.setItem(backupKey, JSON.stringify({ at: Date.now(), startup })); } catch { /* quota */ }
    timer.current = setTimeout(() => { persist(startup); }, 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startup]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await persist(startup);
    if (!ok) { notify.error(t("errors.generic")); }
    else { notify.success(startup.status === "active" ? t("dashboard.editSavedLive") : t("dashboard.editSaved")); router.push("/dashboard/startup"); }
    setSaving(false);
  }

  function update(field: string, value: any) { dirty.current = true; setStartup((s: any) => ({ ...s, [field]: value })); }

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
            {/* Autosave indicator — right-aligned, only when something happens. */}
            <span aria-live="polite" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: saveState === "error" ? "var(--cr-down)" : "var(--cr-ink-4)", minHeight: 18 }}>
              {saveState === "saving" && (<><Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> {t("common.saving")}</>)}
              {saveState === "saved"  && (<><Check style={{ width: 12, height: 12, color: "var(--cr-up)" }} /> {t("dashboard.savedTick")}</>)}
              {saveState === "error"  && t("dashboard.saveFailedRetrying")}
            </span>
          </div>

          {/* Status notice: a live listing stays live while you edit. */}
          {startup.status === "active" ? (
            <div style={{ background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", borderRadius: "4px", padding: "12px 16px", marginBottom: "20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-up)" }}>
              {t("dashboard.editLiveNotice")}
            </div>
          ) : (
            <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(180,83,9,0.2)", borderRadius: "4px", padding: "12px 16px", marginBottom: "20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#B45309" }}>
              {t("dashboard.editReviewNotice")}
            </div>
          )}

          {/* Section nav + completeness — sticky, so long forms stay navigable. */}
          {(() => {
            const sections: Array<[string, string]> = [
              ["sec-basics", t("dashboard.secCompanyBasics")], ["sec-model", t("onboarding.su.businessModel")],
              ["sec-pitch", t("onboarding.su.step3")], ["sec-traction", t("dashboard.secTraction")],
              ["sec-raise", t("onboarding.su.step5")], ["sec-links", t("dashboard.secLinks")],
              ["sec-visibility", t("dashboard.secVisibility")], ["sec-settings", t("dashboard.settings")],
            ];
            const { percent, items } = listingCompleteness(startup);
            const missing = items.filter((i) => !i.done).slice(0, 3);
            return (
              <div style={{ position: "sticky", top: "64px", zIndex: 20, background: "var(--cr-paper)", padding: "8px 0 10px", marginBottom: "16px", borderBottom: "1px solid var(--cr-rule)" }}>
                <div className="scrollbar-hide" style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "6px" }}>
                  {sections.map(([id, label]) => (
                    <a key={id} href={`#${id}`} style={{ flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "999px", padding: "5px 11px", textDecoration: "none", whiteSpace: "nowrap" }}>{label}</a>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                  <div style={{ flex: 1, height: "4px", background: "var(--cr-paper-4)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ width: `${percent}%`, height: "100%", background: percent >= 70 ? "var(--cr-up)" : "var(--cr-copper)", transition: "width 400ms ease" }} />
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600, color: "var(--cr-ink-2)" }}>{percent}/100</span>
                  {missing.length > 0 && (
                    <span className="hidden md:inline" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>
                      · {missing.map((m) => `${t(m.labelKey)} (+${m.weight})`).join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Company Basics */}
            <section id="sec-basics" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secCompanyBasics")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("onboarding.su.companyName")}><WarmInput value={startup.name || ""} onChange={e => update("name", e.target.value)} /></Field>
                <Field label={t("onboarding.su.tagline")}><WarmInput value={startup.tagline || ""} onChange={e => update("tagline", e.target.value)} /></Field>
                <Field label={t("onboarding.su.website")}><WarmInput value={startup.website || ""} onChange={e => update("website", e.target.value)} placeholder="https://…" /></Field>
                <Field label={t("settings.bookingUrl")}><WarmInput value={startup.booking_url || ""} onChange={e => update("booking_url", e.target.value)} placeholder="https://calendly.com/…" /></Field>
                <div className="form-row-2" style={{ gap: "14px" }}>
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
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("editor.roundCloseDate")}>
                    {/* Optional by design: rolling rounds have no date. The
                        listing shows a countdown inside 60 days and "closing
                        soon" once passed — see lib/round-close. */}
                    <WarmInput type="date" value={startup.round_close_date || ""}
                      onChange={e => update("round_close_date", e.target.value || null)} />
                  </Field>
                  <Field label={t("onboarding.su.country")}>
                    {/* See lib/countries: canonical spelling keeps the
                        Region facet and thesis-fit geography working. */}
                    <WarmInput list="cr-countries" value={startup.country || ""}
                      onChange={e => update("country", e.target.value)}
                      onBlur={() => update("country", normalizeCountry(startup.country))} />
                    <datalist id="cr-countries">
                      {COUNTRIES.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </Field>
                  <Field label={t("onboarding.su.city")}><WarmInput value={startup.city || ""} onChange={e => update("city", e.target.value)} placeholder="San Francisco" /></Field>
                </div>
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("onboarding.su.foundedDate")}><WarmInput type="date" value={startup.founded_date || ""} onChange={e => update("founded_date", e.target.value)} /></Field>
                  <Field label={t("onboarding.su.companyType")}>
                    <WarmSelect value={startup.company_type || ""} onChange={e => update("company_type", e.target.value)}>
                      <option value="">{t("onboarding.su.selectType")}</option>
                      {COMPANY_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                    </WarmSelect>
                  </Field>
                </div>
                <div className="form-row-2" style={{ gap: "14px" }}>
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
            <section id="sec-model" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("onboarding.su.businessModel")}</h2>
              <div className="form-row-2" style={{ gap: "14px" }}>
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
            <section id="sec-pitch" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("onboarding.su.step3")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("onboarding.su.problem")}><WarmTextarea value={startup.problem || ""} onChange={e => update("problem", e.target.value)} /></Field>
                <Field label={t("onboarding.su.solution")}><WarmTextarea value={startup.solution || ""} onChange={e => update("solution", e.target.value)} /></Field>
                <Field label={t("onboarding.su.targetMarket")}><WarmTextarea value={startup.market || ""} onChange={e => update("market", e.target.value)} /></Field>
                <Field label={t("onboarding.su.advantage")}><WarmTextarea value={startup.competitive_advantage || ""} onChange={e => update("competitive_advantage", e.target.value)} /></Field>
                <Field label={t("onboarding.su.competitors")} hint={t("dashboard.competitorsHintEnter")}>
                  <TagInput tags={startup.competitors_json || []} onChange={tags => update("competitors_json", tags)} placeholder={t("onboarding.su.competitorNamePh")} />
                </Field>
              
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label="TAM" hint={t("dashboard.tamHint")}><WarmInput type="number" min={0} value={startup.tam ?? ""} onChange={e => update("tam", e.target.value)} placeholder="2000000000" /></Field>
                  <Field label="SAM"><WarmInput type="number" min={0} value={startup.sam ?? ""} onChange={e => update("sam", e.target.value)} placeholder="400000000" /></Field>
                </div>
                <Field label="SOM"><WarmInput type="number" min={0} value={startup.som ?? ""} onChange={e => update("som", e.target.value)} placeholder="40000000" /></Field>
              </div>
            </section>

            {/* Traction & Metrics */}
            <section id="sec-traction" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secTraction")}</h2>
              <div className="form-row-2" style={{ gap: "14px" }}>
                <Field label={t("onboarding.su.mrrUsd")}><WarmInput type="number" value={startup.mrr || ""} onChange={e => update("mrr", e.target.value)} /></Field>
                <Field label={t("onboarding.su.arrUsd")}><WarmInput type="number" value={startup.arr || ""} onChange={e => update("arr", e.target.value)} /></Field>
                <Field label={t("onboarding.su.totalUsers")}><WarmInput type="number" value={startup.user_count || ""} onChange={e => update("user_count", e.target.value)} /></Field>
                <Field label={t("onboarding.su.momGrowth")}><WarmInput type="number" value={startup.growth_rate || ""} onChange={e => update("growth_rate", e.target.value)} /></Field>
                <Field label={t("onboarding.su.payingCustomers")}><WarmInput type="number" value={startup.paying_customers || ""} onChange={e => update("paying_customers", e.target.value)} /></Field>
                <Field label={t("onboarding.su.churn")}><WarmInput type="number" step="0.1" value={startup.churn_rate || ""} onChange={e => update("churn_rate", e.target.value)} /></Field>
                <Field label={t("onboarding.su.runwayMonths")}><WarmInput type="number" value={startup.runway_months || ""} onChange={e => update("runway_months", e.target.value)} /></Field>
              </div>
            </section>

            <MilestonesSection startupId={startup.id} supabase={supabase} />

            {/* The Ask */}
            <section id="sec-raise" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("onboarding.su.step5")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("onboarding.su.fundingTarget")}><WarmInput type="number" value={startup.funding_target || ""} onChange={e => update("funding_target", e.target.value)} /></Field>
                <Field label={t("onboarding.su.equityOffered")}><WarmInput type="number" step="0.1" value={startup.equity_offered || ""} onChange={e => update("equity_offered", e.target.value)} /></Field>
                <Field label={t("onboarding.su.minCheckSize")}><WarmInput type="number" value={startup.min_check_size || ""} onChange={e => update("min_check_size", e.target.value)} /></Field>
                <Field label={t("onboarding.su.useOfFunds")}><WarmTextarea value={startup.use_of_funds || ""} onChange={e => update("use_of_funds", e.target.value)} /></Field>
              
                {/* D44: valuation, so investors do not have to reverse-engineer
                    it from the equity number (and so the two can be checked). */}
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("round.valuation")} hint={t("round.valuationHint")}>
                    <WarmInput type="number" min={0} value={startup.valuation ?? ""} onChange={e => update("valuation", e.target.value)} placeholder="4500000" />
                  </Field>
                  <Field label={t("round.valuationType")} termKey="glossary.preMoney">
                    <WarmSelect value={startup.valuation_type || ""} onChange={e => update("valuation_type", e.target.value)}>
                      <option value="">—</option>
                      <option value="pre">{t("round.pre")}</option>
                      <option value="post">{t("round.post")}</option>
                    </WarmSelect>
                  </Field>
                </div>
                <Field label={t("round.instrument")} termKey="glossary.safe">
                  <WarmSelect value={startup.instrument || ""} onChange={e => update("instrument", e.target.value)}>
                    <option value="">—</option>
                    <option value="equity">{t("round.equity")}</option>
                    <option value="safe">{t("round.safe")}</option>
                    <option value="convertible_note">{t("round.note")}</option>
                  </WarmSelect>
                </Field>
                {(startup.instrument === "safe" || startup.instrument === "convertible_note") && (
                  <div className="form-row-2" style={{ gap: "14px" }}>
                    <Field label={t("round.cap")} termKey="glossary.safe"><WarmInput type="number" min={0} value={startup.safe_cap ?? ""} onChange={e => update("safe_cap", e.target.value)} placeholder="6000000" /></Field>
                    <Field label={t("round.discount")}><WarmInput type="number" min={0} max={99} value={startup.safe_discount ?? ""} onChange={e => update("safe_discount", e.target.value)} placeholder="20" /></Field>
                  </div>
                )}
              </div>
            </section>

            {/* Links & Assets */}
            <section id="sec-links" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
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
            <section id="sec-visibility" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
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
                <div className="form-row-2" style={{ gap: "14px" }}>
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
            <section id="sec-settings" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
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
