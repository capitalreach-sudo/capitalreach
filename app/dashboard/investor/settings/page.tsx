"use client";

import { useEffect, useState, useRef } from "react";
import { LedgerLoader } from "@/components/ui/LedgerLoader";
import { LogoUploader } from "@/components/shared/logo-uploader";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/components/ui/toast-notify";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, Save, X, Plus, Globe, Eye } from "lucide-react";
import { LanguageSettingsSelector } from "@/components/ui/LanguageSettingsSelector";
import Link from "next/link";
import { INDUSTRIES, STAGES } from "@/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

// ── Migration 141 (rich profiles) fixed vocabularies ────────────────────────
// Every one of these is a preset picker, deliberately, not a free <Input> --
// see the workflow brief: "decision speed / involvement / responds-within as
// segmented controls... so they set expectations cleanly". A preset value has
// no contact details in it, so none of these need PROFILE_PROSE_FIELDS the
// way headline (a genuine one-liner) does -- confirmed against
// app/api/investors/save/route.ts, which masks only headline plus the free
// text inside notable_exits/co_investors/portfolio_json.
const INSTRUMENT_OPTIONS = ["SAFE", "Equity", "Convertible Note", "Revenue Share", "Debt"];
const VALUE_ADD_OPTIONS = ["Hiring", "GTM", "Intros", "Technical", "Fundraising", "Ops"];
const DECISION_SPEED_OPTIONS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: "days",       labelKey: "invSettings.decisionDays",      fallback: "Days" },
  { value: "two_weeks",  labelKey: "invSettings.decisionTwoWeeks",  fallback: "2 weeks" },
  { value: "month_plus", labelKey: "invSettings.decisionMonthPlus", fallback: "A month+" },
];
const INVOLVEMENT_OPTIONS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: "hands_on",   labelKey: "invSettings.involvementHandsOn",   fallback: "Hands-on" },
  { value: "board_seat", labelKey: "invSettings.involvementBoardSeat", fallback: "Board seat" },
  { value: "passive",    labelKey: "invSettings.involvementPassive",   fallback: "Passive" },
];
const RESPONDS_WITHIN_OPTIONS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: "same_day", labelKey: "invSettings.respondsSameDay", fallback: "Same day" },
  { value: "24h",       labelKey: "invSettings.responds24h",     fallback: "24 hours" },
  { value: "48h",       labelKey: "invSettings.responds48h",     fallback: "48 hours" },
  { value: "1_week",    labelKey: "invSettings.responds1Week",   fallback: "1 week" },
];
const TOTAL_DEPLOYED_BAND_OPTIONS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: "under_1m",  labelKey: "invSettings.deployedUnder1m", fallback: "Under $1M" },
  { value: "1m_5m",     labelKey: "invSettings.deployed1m5m",    fallback: "$1M – $5M" },
  { value: "5m_25m",    labelKey: "invSettings.deployed5m25m",   fallback: "$5M – $25M" },
  { value: "25m_plus",  labelKey: "invSettings.deployed25mPlus", fallback: "$25M+" },
];
const FIRM_TYPE_OPTIONS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: "angel",          labelKey: "invSettings.firmTypeAngel",         fallback: "Angel" },
  { value: "micro_vc",       labelKey: "invSettings.firmTypeMicroVc",       fallback: "Micro VC" },
  { value: "vc",             labelKey: "invSettings.firmTypeVc",            fallback: "VC" },
  { value: "family_office",  labelKey: "invSettings.firmTypeFamilyOffice",  fallback: "Family Office" },
  { value: "corporate_vc",   labelKey: "invSettings.firmTypeCorporateVc",   fallback: "Corporate VC" },
];

// ── House register ─────────────────────────────────────────────────────────
// Cards are paper-2 slabs with a hairline border at 4px radius; internal
// structure is rules, never nested boxes. Field labels use the Label style
// (small caps, +0.07em). Every numeric input renders in JetBrains Mono.
const CARD: React.CSSProperties = {
  background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px",
};
const FIELD_LABEL = "text-[11px] font-medium uppercase tracking-[0.07em] text-cr-i3";

// ── Simple tag-input component ─────────────────────────────────────────────
function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  }

  function remove(tag: string) {
    onChange(tags.filter(t => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="min-h-10 rounded-md border border-input bg-background px-2 py-1.5 focus-within:border-cr-copper">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-[3px] border border-cr-p4 bg-cr-p2 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-cr-i3"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="-my-1 -mr-1 flex h-6 w-6 items-center justify-center text-cr-i4 hover:text-cr-ink"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={add}
          placeholder={tags.length === 0 ? (placeholder ?? "Type and press Enter…") : ""}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-cr-i4"
        />
      </div>
    </div>
  );
}

// ── SegmentedControl ─────────────────────────────────────────────────────────
// Single-select preset picker. Same pill visual as the STAGES multi-select
// toggle further down this file, just one value active at a time instead of
// many -- deliberately not a free <Input>: decision_speed, involvement,
// total_deployed_band, firm_type and responds_within are all self-reported
// picks from a short fixed list, so a segmented control is the honest
// widget (it cannot express anything the profile page doesn't already know
// how to render), where a text box would invite free text nothing downstream
// expects.
function SegmentedControl({
  value, onChange, options, allowClear = true,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: Array<{ value: string; label: string }>;
  allowClear?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(value === opt.value ? (allowClear ? null : opt.value) : opt.value)}
          className={cn(
            "min-h-10 rounded-full border px-4 text-xs transition-colors",
            value === opt.value
              ? "border-[var(--cr-copper-br)] bg-[var(--cr-copper-bg)] font-medium text-cr-copper"
              : "border-cr-p4 text-cr-i3 hover:border-cr-i4"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Generic row repeater ─────────────────────────────────────────────────────
// Generalized from this file's own PortfolioEditor (the one repeater this
// form already had) rather than importing the startup edit page's private
// RepeaterField -- that component lives local to one file, not a shared
// module, and the brief is explicit: reuse a shared location if one exists,
// otherwise this form's own existing pattern, never invent a third. Same
// grid-cols-[minmax(0,1fr)_auto] anatomy, same X remove control, same
// stacks-to-one-column-under-sm behaviour; only the field list is now data
// rather than three hardcoded <Input>s, so Portfolio and Notable Exits share
// one implementation instead of two near-identical ones.
interface RepeaterFieldSpec<T> {
  key: keyof T & string;
  placeholder: string;
  type?: "text" | "number" | "url";
  options?: string[];
}

function RowRepeater<T extends Record<string, string | undefined>>({
  rows, onChange, fields, emptyRow, addLabel, columns = 3,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  fields: RepeaterFieldSpec<T>[];
  emptyRow: T;
  addLabel: string;
  columns?: number;
}) {
  function add() { onChange([...rows, { ...emptyRow }]); }
  function remove(i: number) { onChange(rows.filter((_, idx) => idx !== i)); }
  function update(i: number, key: string, value: string) {
    onChange(rows.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  }

  const gridCols = columns >= 3 ? "sm:grid-cols-2 md:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className={cn("grid min-w-0 grid-cols-1 gap-2", gridCols)}>
            {fields.map(f => f.options ? (
              <select
                key={f.key}
                value={row[f.key] ?? ""}
                onChange={e => update(i, f.key, e.target.value)}
                className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{f.placeholder}</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <Input
                key={f.key}
                type={f.type === "number" ? "number" : "text"}
                value={row[f.key] ?? ""}
                onChange={e => update(i, f.key, e.target.value)}
                placeholder={f.placeholder}
                className="min-w-0"
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-cr-i4 transition-colors hover:text-cr-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="h-10 gap-1.5 rounded-full px-4 text-xs">
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

// ── Portfolio company entry ────────────────────────────────────────────────
// Row shape reconciled across three surfaces that disagreed before this pass
// (settings wrote {name,stage,outcome}, onboarding wrote {name,stage,year},
// the profile read {name,stage,outcome}, and the type declared none of that
// correctly). `year` is kept, not dropped -- an investor may already have
// typed one at onboarding, and the standing rule is add, never remove. New
// this pass: `sector` (drawn from the same INDUSTRIES list used everywhere
// else, not a parallel vocabulary) and `url`, sanitized server-side on save.
interface PortfolioCompany {
  name: string;
  stage?: string;
  outcome?: string;
  year?: string;
  sector?: string;
  url?: string;
  [key: string]: string | undefined;
}

function PortfolioEditor({
  portfolio,
  onChange,
}: {
  portfolio: PortfolioCompany[];
  onChange: (p: PortfolioCompany[]) => void;
}) {
  const { t } = useTranslation();
  const tf = (key: string, fallback: string) => { const out = t(key); return out === key ? fallback : out; };
  return (
    <RowRepeater<PortfolioCompany>
      rows={portfolio}
      onChange={onChange}
      emptyRow={{ name: "", stage: "", outcome: "", year: "", sector: "", url: "" }}
      addLabel={t("onboarding.inv.addCompany")}
      fields={[
        { key: "name", placeholder: t("onboarding.inv.companyNamePh") },
        { key: "sector", placeholder: tf("invSettings.portfolioSectorPh", "Sector"), options: INDUSTRIES as unknown as string[] },
        { key: "stage", placeholder: t("dashboard.phStage") },
        { key: "outcome", placeholder: t("dashboard.phOutcome") },
        { key: "year", placeholder: t("onboarding.inv.yearPh") },
        { key: "url", placeholder: tf("invSettings.portfolioUrlPh", "Company URL"), type: "url" },
      ]}
    />
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function InvestorSettingsPage() {
  const { t } = useTranslation();
  // Renders the fallback until a key lands in every locale -- same shim the
  // revealed profile page and the startup edit page's team section use.
  const tf = (key: string, fallback: string) => { const out = t(key); return out === key ? fallback : out; };
  const [investor, setInvestor] = useState<any>(null);
  const [accredited, setAccredited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const [{ data }, { data: profile }, { data: roleRow, error: roleErr }] = await Promise.all([
        supabase.from("investors").select("*").eq("owner_id", user.id).single(),
        supabase.from("profiles").select("investor_type,portfolio_count,lead_investor,check_size_min,check_size_max,languages,accreditation_certified").eq("id", user.id).single(),
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      ]);
      // Investor settings belong to an investor account. Any other role goes
      // to its own dashboard before anything renders; an admin who owns an
      // investor entity stays, as on app/dashboard/investor/page.tsx. An
      // unreadable role goes to /dashboard, which resolves it server-side.
      const accountRole = roleErr ? null : roleRow?.role;
      if (accountRole !== "investor" && !(accountRole === "admin" && data)) {
        router.replace(
          accountRole === "startup" ? "/dashboard/startup"
            : accountRole === "admin" ? "/admin"
            : "/dashboard",
        );
        return;
      }
      if (data) {
        // Ensure arrays / json default properly
        data.industries = data.industries || [];
        data.stages = data.stages || [];
        data.geography = data.geography || [];
        data.portfolio_json = Array.isArray(data.portfolio_json) ? data.portfolio_json : [];
        // Migration 141: null on every listing pre-dating this pass
        // (confirmed live), so every repeater/multi-select below can map
        // over its array unconditionally.
        data.instruments_preferred = Array.isArray(data.instruments_preferred) ? data.instruments_preferred : [];
        data.value_add = Array.isArray(data.value_add) ? data.value_add : [];
        data.notable_exits = Array.isArray(data.notable_exits) ? data.notable_exits : [];
        data.co_investors = Array.isArray(data.co_investors) ? data.co_investors : [];
        setAccredited(!!profile?.accreditation_certified);
        // Merge profile fields
        // type and languages come from the investors row itself now; the
        // old merge overlaid five dead profiles columns on top of it.
      }
      setInvestor(data);
      setLoading(false);
    })();
  }, []);

  function set(field: string, value: any) {
    setInvestor((i: any) => ({ ...i, [field]: value }));
  }

  function toggleArr(field: "industries" | "stages" | "instruments_preferred" | "value_add", val: string) {
    setInvestor((inv: any) => {
      const arr = inv[field] || [];
      return { ...inv, [field]: arr.includes(val) ? arr.filter((v: string) => v !== val) : [...arr, val] };
    });
  }

  // A repeater row opened but never filled must not be saved -- the profile
  // page renders whatever is in the array, so an empty row would ship as a
  // blank line no "hide gracefully" check downstream can catch, because it
  // is present, not missing. Same rule the startup edit page's own
  // nonEmptyRows enforces.
  function nonEmptyRows<T extends Record<string, unknown>>(rows: T[] | null | undefined): T[] {
    return (rows || []).filter((r) => Object.values(r).some((v) => typeof v === "string" ? v.trim() : !!v));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // Through the route: a bio and a thesis are published to every founder
    // who opens the profile, so contact details in them are masked on write.
    const res = await fetch("/api/investors/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: {
        // Basic profile
        display_name: investor.display_name || null,
        firm_name: investor.firm_name || null,
        headline: investor.headline || null,
        bio: investor.bio || null,
        website: investor.website || null,
        booking_url: investor.booking_url || null,
        video_url: investor.video_url || null,
        linkedin_url: investor.linkedin_url || null,
        twitter_url: investor.twitter_url || null,
        // Investment details
        investment_thesis: investor.investment_thesis || null,
        aum: investor.aum || null,
        follow_on_policy: investor.follow_on_policy || null,
        board_seat_pref: investor.board_seat_pref || null,
        lead_rounds: !!investor.lead_rounds,
        number_of_investments: investor.number_of_investments ? parseInt(investor.number_of_investments) : null,
        avg_hold_period: investor.avg_hold_period || null,
        portfolio_json: nonEmptyRows(investor.portfolio_json),
        // Migration 141: deal-making profile. All five are fixed presets
        // (SegmentedControl), never free text -- see the vocab comment
        // above, and app/investors/[slug]/page.tsx renders each through the
        // same label map used to build these options, so a value saved here
        // always has a human label to show, never a raw key.
        decision_speed: investor.decision_speed || null,
        involvement: investor.involvement || null,
        total_deployed_band: investor.total_deployed_band || null,
        firm_type: investor.firm_type || null,
        responds_within: investor.responds_within || null,
        sweet_spot: investor.sweet_spot ? parseInt(investor.sweet_spot) : null,
        instruments_preferred: investor.instruments_preferred?.length ? investor.instruments_preferred : null,
        value_add: investor.value_add?.length ? investor.value_add : null,
        notable_exits: nonEmptyRows(investor.notable_exits),
        co_investors: nonEmptyRows(investor.co_investors),
        // Investment preferences
        industries: investor.industries,
        stages: investor.stages,
        min_check: investor.min_check ? parseInt(investor.min_check) : null,
        max_check: investor.max_check ? parseInt(investor.max_check) : null,
        type: investor.type || null,
        languages: investor.languages?.length ? investor.languages : null,
        geography: investor.geography,
      } }),
    }).catch(() => null);
    const saved = res ? await res.json().catch(() => ({})) : {};
    const ok = !!res && res.ok && !!saved?.id;

    // Save new profile fields to profiles table
    if (ok) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({
          accreditation_certified: accredited,
        }).eq("id", user.id);
      }
    }

    if (!ok) {
      notify.error(saved?.error ? `${t("dashboard.saveFailed")}. ${saved.error}` : t("dashboard.saveFailed"));
    } else if (saved.contactsWithheld?.length) {
      // The form still holds what was typed; put back what was stored, so the
      // box on screen is the profile people will read.
      setInvestor((i: any) => ({ ...i, ...saved.maskedFields }));
      notify.success(`${t("dashboard.profileUpdated")}. ${t("listingSafety.withheld")}`);
    } else {
      notify.success(`${t("dashboard.profileUpdated")}. ${t("dashboard.allChangesSaved")}`);
    }
    setSaving(false);
  }

  if (loading) return <><Navbar /><div className="flex h-64 items-center justify-center"><LedgerLoader /></div></>;
  if (!investor) return (
    <>
      <Navbar />
      <div className="py-24 text-center">
        <span aria-hidden style={{ color: "var(--cr-copper)" }}>✦</span>
        <p className="mt-3 text-sm text-cr-i3">{t("dashboard.noInvestorProfile")}</p>
      </div>
    </>
  );

  return (
    <>
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-8 md:py-12" style={{ background: "var(--cr-paper)" }}>
        <header className="mb-8 pb-6" style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <Link href="/dashboard/investor">
              <Button variant="ghost" size="sm" className="-ml-2 h-10 gap-1.5"><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Button>
            </Link>

            {/* The profile page can preview itself, but nothing led there from
                the editor -- so the only view of these fields was the form, which
                shows inputs rather than the result founders actually judge. */}
            {investor.slug && (
              <Link
                href={`/investors/${investor.slug}`}
                className="inline-flex min-h-10 items-center gap-1.5 text-sm text-cr-copper hover:underline"
              >
                <Eye className="h-3.5 w-3.5" /> {t("dashboard.viewPublicProfile")}
              </Link>
            )}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(28px, 4vw, 36px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--cr-ink)" }}>
            {t("dashboard.investorSettings")}
          </h1>
        </header>

        <form onSubmit={handleSave} className="space-y-6">

          {/* ── Accreditation ─────────────────────────────────────────────── */}
          {/* Linked to from the listing's offer button, which is where an
              investor discovers they need this. */}
          <div id="accreditation" className="scroll-mt-24 p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "8px" }}>{t("settings.accTitle")}</h2>
            <p className="mb-4 text-sm leading-relaxed text-cr-i3">{t("settings.accBody")}</p>
            <label className="flex cursor-pointer items-start gap-3 py-1">
              <input type="checkbox" checked={accredited} onChange={e => setAccredited(e.target.checked)}
                style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, marginTop: 2, flexShrink: 0, cursor: "pointer" }} />
              <span className="text-sm leading-relaxed text-cr-ink">{t("settings.accCheckbox")}</span>
            </label>
            {!accredited && (
              <p className="mt-3 text-xs leading-relaxed text-cr-i4">{t("settings.accLockedHint")}</p>
            )}
          </div>

          {/* ── Identity ──────────────────────────────────────────────────── */}
          <div className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "16px" }}>{t("dashboard.secIdentity")}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className={FIELD_LABEL}>{t("dashboard.displayName")}</Label>
                  <Input
                    value={investor.display_name || ""}
                    onChange={e => set("display_name", e.target.value)}
                    placeholder={t("dashboard.displayNamePh")}
                  />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.firmName")}</Label>
                  <Input
                    value={investor.firm_name || ""}
                    onChange={e => set("firm_name", e.target.value)}
                    placeholder="Sequoia Capital"
                  />
                </div>
              </div>
              {/* Migration 141. The directory equivalent of a startup
                  tagline -- shown right under the name on the public
                  profile, before a founder ever reads the full bio, so it
                  is the one line that decides whether they keep scrolling. */}
              <div>
                <Label className={FIELD_LABEL}>{tf("invSettings.headline", "Headline")}</Label>
                <p className="mb-1.5 text-xs text-cr-i3">
                  {tf("invSettings.headlineHint", "One line under your name on the public profile, e.g. \"Seed-stage B2B SaaS, DACH\".")}
                </p>
                <Input
                  value={investor.headline || ""}
                  onChange={e => set("headline", e.target.value)}
                  maxLength={140}
                  placeholder={tf("invSettings.headlinePh", "Seed-stage B2B SaaS, DACH")}
                />
              </div>
              <div>
                <Label className={FIELD_LABEL}>{t("onboarding.inv.shortBio")}</Label>
                <Textarea
                  value={investor.bio || ""}
                  onChange={e => set("bio", e.target.value)}
                  className="h-24"
                  placeholder="Angel investor focused on B2B SaaS at the pre-seed stage…"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.website")}</Label>
                  <Input
                    value={investor.website || ""}
                    onChange={e => set("website", e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>{t("settings.bookingUrl")}</Label>
                  <Input
                    value={investor.booking_url || ""}
                    onChange={e => set("booking_url", e.target.value)}
                    placeholder="https://calendly.com/…"
                  />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.linkedin")}</Label>
                  <Input
                    value={investor.linkedin_url || ""}
                    onChange={e => set("linkedin_url", e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                  />
                </div>
              </div>
              {/* Profile image — paid plans; the API enforces, this explains. */}
              <div>
                <Label className={FIELD_LABEL}>{t("invSettings.profileImage")}</Label>
                {investor.subscription_tier && investor.subscription_tier !== "free" ? (
                  <LogoUploader entityType="investor" name={investor.display_name || investor.firm_name || "?"} logoUrl={investor.logo_url ?? null} logoColor={investor.logo_color ?? null} onChanged={(url, color) => setInvestor((i: any) => ({ ...i, logo_url: url, logo_color: color }))} />
                ) : (
                  <p className="mt-1 text-xs text-cr-i4">
                    {t("invSettings.imagePaid")}{" "}
                    <Link href="/pricing" className="text-cr-copper underline underline-offset-2">{t("common.upgrade")}</Link>
                  </p>
                )}
              </div>
              {/* Intro video — top two investor plans. */}
              <div>
                <Label className={FIELD_LABEL}>{t("invSettings.introVideo")}</Label>
                {investor.subscription_tier === "pro" || investor.subscription_tier === "institution" ? (
                  <Input
                    value={investor.video_url || ""}
                    onChange={e => set("video_url", e.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                  />
                ) : (
                  <p className="mt-1 text-xs text-cr-i4">
                    {t("invSettings.videoPaid")}{" "}
                    <Link href="/pricing" className="text-cr-copper underline underline-offset-2">{t("common.upgrade")}</Link>
                  </p>
                )}
              </div>
              <div>
                <Label className={FIELD_LABEL}>{t("onboarding.inv.twitterX")}</Label>
                <Input
                  value={investor.twitter_url || ""}
                  onChange={e => set("twitter_url", e.target.value)}
                  placeholder="https://x.com/…"
                />
              </div>
            </div>
          </div>

          {/* ── Investment Details ─────────────────────────────────────────── */}
          <div className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "16px" }}>{t("dashboard.secInvestmentDetails")}</h2>
            <div className="space-y-4">
              <div>
                <Label className={FIELD_LABEL}>{t("onboarding.inv.thesis")}</Label>
                <Textarea
                  value={investor.investment_thesis || ""}
                  onChange={e => set("investment_thesis", e.target.value)}
                  className="h-24"
                  placeholder="We back technical founders solving hard problems in regulated industries…"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.aumLabel")}</Label>
                  <Input
                    value={investor.aum || ""}
                    onChange={e => set("aum", e.target.value)}
                    className="font-mono"
                    placeholder="e.g. $50M"
                  />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.numInvestments")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={investor.number_of_investments ?? ""}
                    onChange={e => set("number_of_investments", e.target.value)}
                    className="font-mono"
                    placeholder="e.g. 24"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.holdPeriod")}</Label>
                  <Input
                    value={investor.avg_hold_period || ""}
                    onChange={e => set("avg_hold_period", e.target.value)}
                    placeholder="e.g. 5–7 years"
                  />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.followOn")}</Label>
                  <Input
                    value={investor.follow_on_policy || ""}
                    onChange={e => set("follow_on_policy", e.target.value)}
                    placeholder="e.g. Pro-rata rights"
                  />
                </div>
              </div>
              <div>
                <Label className={FIELD_LABEL}>{t("onboarding.inv.boardPref")}</Label>
                <Input
                  value={investor.board_seat_pref || ""}
                  onChange={e => set("board_seat_pref", e.target.value)}
                  placeholder="e.g. Observer seat preferred"
                />
              </div>

              {/* ── Deal-making profile (migration 141) ──────────────────────
                  Five preset pickers, deliberately not free text -- so a
                  founder reads a fact ("Board seat", "48 hours") instead of
                  whatever wording an investor happened to type. Each hides on
                  the public profile when unset, same as everything else here. */}
              <div className="pt-4" style={{ borderTop: "1px solid var(--cr-rule)" }}>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{tf("invSettings.decisionSpeed", "Decision speed")}</Label>
                <p className="mb-2 text-xs text-cr-i3">{tf("invSettings.decisionSpeedHint", "How long a founder should expect to wait for a yes or no.")}</p>
                <SegmentedControl
                  value={investor.decision_speed}
                  onChange={v => set("decision_speed", v)}
                  options={DECISION_SPEED_OPTIONS.map(o => ({ value: o.value, label: tf(o.labelKey, o.fallback) }))}
                />
              </div>
              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{tf("invSettings.involvement", "Involvement")}</Label>
                <p className="mb-2 text-xs text-cr-i3">{tf("invSettings.involvementHint", "How hands-on you typically are once you invest.")}</p>
                <SegmentedControl
                  value={investor.involvement}
                  onChange={v => set("involvement", v)}
                  options={INVOLVEMENT_OPTIONS.map(o => ({ value: o.value, label: tf(o.labelKey, o.fallback) }))}
                />
              </div>
              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{tf("invSettings.respondsWithin", "Responds within")}</Label>
                <p className="mb-2 text-xs text-cr-i3">{tf("invSettings.respondsWithinHint", "A self-set SLA, purely informational, never enforced.")}</p>
                <SegmentedControl
                  value={investor.responds_within}
                  onChange={v => set("responds_within", v)}
                  options={RESPONDS_WITHIN_OPTIONS.map(o => ({ value: o.value, label: tf(o.labelKey, o.fallback) }))}
                />
              </div>
              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{tf("invSettings.totalDeployedBand", "Total deployed")}</Label>
                <p className="mb-2 text-xs text-cr-i3">{tf("invSettings.totalDeployedBandHint", "Banded, not exact -- your real total stays private, founders just see the range.")}</p>
                <SegmentedControl
                  value={investor.total_deployed_band}
                  onChange={v => set("total_deployed_band", v)}
                  options={TOTAL_DEPLOYED_BAND_OPTIONS.map(o => ({ value: o.value, label: tf(o.labelKey, o.fallback) }))}
                />
              </div>
              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{tf("invSettings.firmType", "Firm type")}</Label>
                <p className="mb-2 text-xs text-cr-i3">{tf("invSettings.firmTypeHint", "A more specific label than the account type below, e.g. \"Micro VC\" vs. plain \"VC\".")}</p>
                <SegmentedControl
                  value={investor.firm_type}
                  onChange={v => set("firm_type", v)}
                  options={FIRM_TYPE_OPTIONS.map(o => ({ value: o.value, label: tf(o.labelKey, o.fallback) }))}
                />
              </div>

              {/* A rule, not a box: toggles separate from the fields above
                  with a hairline instead of a nested card. */}
              <div className="flex items-center justify-between gap-4 pt-4" style={{ borderTop: "1px solid var(--cr-rule)" }}>
                <div>
                  <p className="text-sm font-medium text-cr-ink">{t("dashboard.leadRoundsLabel")}</p>
                  <p className="text-xs text-cr-i3">{t("dashboard.leadRoundsQ")}</p>
                </div>
                <Switch
                  checked={!!investor.lead_rounds}
                  onCheckedChange={v => set("lead_rounds", v)}
                />
              </div>
            </div>
          </div>

          {/* ── Portfolio ──────────────────────────────────────────────────── */}
          <div className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "6px" }}>{t("onboarding.inv.portfolioLabel")}</h2>
            <p className="mb-4 text-xs text-cr-i3">
              {t("dashboard.portfolioSub")} {tf("invSettings.portfolioRowHint", "Add a sector, a year and a link where you have them -- a founder skimming your portfolio reads faster with more to go on.")}
            </p>
            <PortfolioEditor
              portfolio={investor.portfolio_json || []}
              onChange={p => set("portfolio_json", p)}
            />
          </div>

          {/* ── Track record (migration 141) ─────────────────────────────────
              Notable exits and the co-investors you typically syndicate with.
              Both free text (company names, outcomes), so both run through
              the same server-side masking as bio/thesis -- see
              app/api/investors/save/route.ts's jsonArrayProseFields. */}
          <div className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "6px" }}>{tf("invSettings.trackRecord", "Track record")}</h2>
            <p className="mb-4 text-xs text-cr-i3">{tf("invSettings.trackRecordHint", "The exits and co-investors that back up your thesis -- founders read this as evidence, not just a claim.")}</p>
            <div className="space-y-5">
              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{tf("invSettings.notableExits", "Notable exits")}</Label>
                <RowRepeater<{ company: string; outcome: string }>
                  rows={investor.notable_exits || []}
                  onChange={rows => set("notable_exits", rows)}
                  emptyRow={{ company: "", outcome: "" }}
                  addLabel={tf("invSettings.addExit", "Add an exit")}
                  columns={2}
                  fields={[
                    { key: "company", placeholder: tf("invSettings.exitCompanyPh", "Company") },
                    { key: "outcome", placeholder: tf("invSettings.exitOutcomePh", "Outcome, e.g. Acquired by Adobe") },
                  ]}
                />
              </div>
              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{tf("invSettings.coInvestorsLabel", "Co-investors")}</Label>
                <p className="mb-2 text-xs text-cr-i3">{tf("invSettings.coInvestorsHint", "Names only -- most are not on CapitalReach, this is not a link to their profile.")}</p>
                <TagInput
                  tags={(investor.co_investors || []).map((c: { name: string }) => c.name).filter(Boolean)}
                  onChange={names => set("co_investors", names.map(name => ({ name })))}
                  placeholder={tf("invSettings.coInvestorsPh", "Type a name and press Enter…")}
                />
              </div>
            </div>
          </div>

          {/* ── Investment Preferences ─────────────────────────────────────── */}
          <div className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "16px" }}>{t("onboarding.inv.h2")}</h2>
            <div className="space-y-5">
              <div>
                <Label className={cn(FIELD_LABEL, "mb-2 block")}>{t("dashboard.industriesLabel")}</Label>
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  {INDUSTRIES.map(ind => (
                    <label key={ind} className="flex min-h-10 cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={(investor.industries || []).includes(ind)}
                        onCheckedChange={() => toggleArr("industries", ind)}
                      />
                      <span className="text-sm">{ind}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label className={cn(FIELD_LABEL, "mb-2 block")}>{t("dashboard.stagesLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  {STAGES.map(s => (
                    <button
                      type="button"
                      key={s.value}
                      onClick={() => toggleArr("stages", s.value)}
                      className={cn(
                        "min-h-10 rounded-full border px-4 text-xs transition-colors",
                        (investor.stages || []).includes(s.value)
                          ? "border-[var(--cr-copper-br)] bg-[var(--cr-copper-bg)] font-medium text-cr-copper"
                          : "border-cr-p4 text-cr-i3 hover:border-cr-i4"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.minCheck")}</Label>
                  <Input
                    type="number"
                    value={investor.min_check || ""}
                    onChange={e => set("min_check", e.target.value)}
                    className="font-mono"
                    placeholder="25000"
                  />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.maxCheck")}</Label>
                  <Input
                    type="number"
                    value={investor.max_check || ""}
                    onChange={e => set("max_check", e.target.value)}
                    className="font-mono"
                    placeholder="500000"
                  />
                </div>
              </div>

              {/* Migration 141. Exact, deliberately -- unlike total_deployed
                  above, a typical single cheque is not competitively
                  sensitive the way a career total is, and it is the number
                  a founder actually wants: where in the min-max range you
                  usually land. */}
              <div>
                <Label className={FIELD_LABEL}>{tf("invSettings.sweetSpot", "Sweet spot")}</Label>
                <p className="mb-1.5 text-xs text-cr-i3">{tf("invSettings.sweetSpotHint", "Your typical single cheque, if it differs from the middle of the range above.")}</p>
                <Input
                  type="number"
                  value={investor.sweet_spot || ""}
                  onChange={e => set("sweet_spot", e.target.value)}
                  className="font-mono"
                  placeholder="100000"
                />
              </div>

              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{tf("invSettings.instrumentsPreferred", "Instruments preferred")}</Label>
                <p className="mb-2 text-xs text-cr-i3">{tf("invSettings.instrumentsPreferredHint", "Which structures you're set up to write, so a founder does not pitch a SAFE to a priced-round-only cheque.")}</p>
                <div className="flex flex-wrap gap-2">
                  {INSTRUMENT_OPTIONS.map(opt => (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => toggleArr("instruments_preferred", opt)}
                      className={cn(
                        "min-h-10 rounded-full border px-4 text-xs transition-colors",
                        (investor.instruments_preferred || []).includes(opt)
                          ? "border-[var(--cr-copper-br)] bg-[var(--cr-copper-bg)] font-medium text-cr-copper"
                          : "border-cr-p4 text-cr-i3 hover:border-cr-i4"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{tf("invSettings.valueAdd", "Value-add")}</Label>
                <p className="mb-2 text-xs text-cr-i3">{tf("invSettings.valueAddHint", "What you actually help with beyond the cheque -- the thing a founder is choosing between investors on.")}</p>
                <div className="flex flex-wrap gap-2">
                  {VALUE_ADD_OPTIONS.map(opt => (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => toggleArr("value_add", opt)}
                      className={cn(
                        "min-h-10 rounded-full border px-4 text-xs transition-colors",
                        (investor.value_add || []).includes(opt)
                          ? "border-[var(--cr-copper-br)] bg-[var(--cr-copper-bg)] font-medium text-cr-copper"
                          : "border-cr-p4 text-cr-i3 hover:border-cr-i4"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{t("onboarding.inv.geography")}</Label>
                <p className="mb-2 text-xs text-cr-i3">{t("dashboard.geoHintEnter")}</p>
                <TagInput
                  tags={investor.geography || []}
                  onChange={tags => set("geography", tags)}
                  placeholder="United States, Europe, Global…"
                />
              </div>
            </div>
          </div>

          {/* ── Profile details. Only fields with a REAL home: this section
              used to write investor_type, portfolio_count, lead_investor,
              check_size_min/max and languages to orphaned profiles columns
              nothing on the platform reads -- the public page, matching and
              deal filters all read the investors table, where three of those
              five already have inputs elsewhere on this page. What remains
              here saves to the columns that actually render. ────────────── */}
          <div className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "6px" }}>{t("dashboard.secProfileDetail")}</h2>
            <p className="mb-4 text-xs text-cr-i3">{t("dashboard.profileDetailSub")}</p>
            <div className="space-y-4">
              <div>
                <Label className={FIELD_LABEL}>{t("onboarding.inv.step1")}</Label>
                <select
                  value={investor.type || ""}
                  onChange={e => set("type", e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t("dashboard.selectDots")}</option>
                  {/* The DB CHECK on investors.type accepts exactly these
                      four; the old "syndicate" option could never save. */}
                  {[
                    { value: "angel",         labelKey: "dashboard.itAngel" },
                    { value: "vc",            labelKey: "dashboard.itVc"    },
                    { value: "family_office", labelKey: "dashboard.itFo"    },
                    { value: "corporate",     labelKey: "dashboard.itCorp"  },
                  ].map(it => (
                    <option key={it.value} value={it.value}>{t(it.labelKey)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className={cn(FIELD_LABEL, "mb-1.5 block")}>{t("dashboard.languagesSpoken")}</Label>
                <TagInput
                  tags={investor.languages || []}
                  onChange={tags => set("languages", tags)}
                  placeholder="English, German, French…"
                />
              </div>
            </div>
          </div>

          {/* The one primary action on this view. */}
          <Button type="submit" className="h-11 w-full gap-2 rounded-full bg-cr-copper text-[13px] font-semibold text-white hover:bg-cr-cu-d" disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? t("common.saving") : t("dashboard.saveAll")}
          </Button>
        </form>

        {/* Language section (outside form — has its own save) */}
        <section className="mt-6 p-4 sm:p-6" style={CARD}>
          <h2 className="ruled-label" style={{ marginBottom: "8px" }}>
            <Globe className="h-3.5 w-3.5 text-cr-copper" aria-hidden />
            {t("settings.language")}
          </h2>
          <p className="mb-4 text-sm text-cr-i3">
            {t("settings.languageDesc")}
          </p>
          <LanguageSettingsSelector />
        </section>
      </main>
    </>
  );
}
