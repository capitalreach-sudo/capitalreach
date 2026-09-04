"use client";

import { useEffect, useState, useRef } from "react";
import { LogoUploader } from "@/components/shared/logo-uploader";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, Save, X, Plus, Globe, Eye } from "lucide-react";
import { LanguageSettingsSelector } from "@/components/ui/LanguageSettingsSelector";
import Link from "next/link";
import { INDUSTRIES, STAGES } from "@/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

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

// ── Portfolio company entry ────────────────────────────────────────────────
interface PortfolioCompany {
  name: string;
  stage?: string;
  outcome?: string;
}

function PortfolioEditor({
  portfolio,
  onChange,
}: {
  portfolio: PortfolioCompany[];
  onChange: (p: PortfolioCompany[]) => void;
}) {
  const { t } = useTranslation();
  function add() {
    onChange([...portfolio, { name: "", stage: "", outcome: "" }]);
  }
  function remove(i: number) {
    onChange(portfolio.filter((_, idx) => idx !== i));
  }
  function update(i: number, field: keyof PortfolioCompany, value: string) {
    onChange(portfolio.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  }

  return (
    <div className="space-y-3">
      {portfolio.map((co, i) => (
        // minmax(0,1fr) tracks let every input shrink below its intrinsic
        // width, so a row never overflows at 375px; below sm the three
        // fields stack in one column with the remove control alongside.
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Input
              value={co.name}
              onChange={e => update(i, "name", e.target.value)}
              placeholder={t("onboarding.inv.companyNamePh")}
              className="min-w-0"
            />
            <Input
              value={co.stage || ""}
              onChange={e => update(i, "stage", e.target.value)}
              placeholder={t("dashboard.phStage")}
              className="min-w-0"
            />
            <Input
              value={co.outcome || ""}
              onChange={e => update(i, "outcome", e.target.value)}
              placeholder={t("dashboard.phOutcome")}
              className="min-w-0"
            />
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
        <Plus className="h-3.5 w-3.5" /> {t("onboarding.inv.addCompany")}
      </Button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function InvestorSettingsPage() {
  const { t } = useTranslation();
  const [investor, setInvestor] = useState<any>(null);
  const [accredited, setAccredited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const [{ data }, { data: profile }] = await Promise.all([
        supabase.from("investors").select("*").eq("owner_id", user.id).single(),
        supabase.from("profiles").select("investor_type,portfolio_count,lead_investor,check_size_min,check_size_max,languages,accreditation_certified").eq("id", user.id).single(),
      ]);
      if (data) {
        // Ensure arrays / json default properly
        data.industries = data.industries || [];
        data.stages = data.stages || [];
        data.geography = data.geography || [];
        data.portfolio_json = Array.isArray(data.portfolio_json) ? data.portfolio_json : [];
        setAccredited(!!profile?.accreditation_certified);
        // Merge profile fields
        if (profile) {
          data.investor_type  = profile.investor_type;
          data.portfolio_count = profile.portfolio_count;
          data.lead_investor  = profile.lead_investor;
          data.check_size_min = profile.check_size_min;
          data.check_size_max = profile.check_size_max;
          data.languages      = profile.languages || [];
        }
      }
      setInvestor(data);
      setLoading(false);
    })();
  }, []);

  function set(field: string, value: any) {
    setInvestor((i: any) => ({ ...i, [field]: value }));
  }

  function toggleArr(field: "industries" | "stages", val: string) {
    setInvestor((inv: any) => {
      const arr = inv[field] || [];
      return { ...inv, [field]: arr.includes(val) ? arr.filter((v: string) => v !== val) : [...arr, val] };
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("investors")
      .update({
        // Basic profile
        display_name: investor.display_name || null,
        firm_name: investor.firm_name || null,
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
        portfolio_json: investor.portfolio_json || [],
        // Investment preferences
        industries: investor.industries,
        stages: investor.stages,
        min_check: investor.min_check ? parseInt(investor.min_check) : null,
        max_check: investor.max_check ? parseInt(investor.max_check) : null,
        geography: investor.geography,
      })
      .eq("id", investor.id);

    // Save new profile fields to profiles table
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({
          investor_type:    investor.investor_type || null,
          portfolio_count:  investor.portfolio_count ? parseInt(investor.portfolio_count) : null,
          lead_investor:    !!investor.lead_investor,
          check_size_min:   investor.check_size_min ? parseFloat(investor.check_size_min) : null,
          check_size_max:   investor.check_size_max ? parseFloat(investor.check_size_max) : null,
          languages:        investor.languages?.length ? investor.languages : null,
          accreditation_certified: accredited,
        }).eq("id", user.id);
      }
    }

    if (error) {
      toast({ title: t("dashboard.saveFailed"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("dashboard.profileUpdated"), description: t("dashboard.allChangesSaved") });
    }
    setSaving(false);
  }

  if (loading) return <><Navbar /><div className="flex h-64 items-center justify-center text-sm text-cr-i4">{t("common.loading")}</div></>;
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
          <div className="p-4 sm:p-6" style={CARD}>
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
            <p className="mb-4 text-xs text-cr-i3">{t("dashboard.portfolioSub")}</p>
            <PortfolioEditor
              portfolio={investor.portfolio_json || []}
              onChange={p => set("portfolio_json", p)}
            />
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

          {/* ── Richer Profile Fields (Feature 3) ─────────────────────── */}
          <div className="p-4 sm:p-6" style={CARD}>
            <h2 className="ruled-label" style={{ marginBottom: "6px" }}>{t("dashboard.secProfileDetail")}</h2>
            <p className="mb-4 text-xs text-cr-i3">{t("dashboard.profileDetailSub")}</p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.step1")}</Label>
                  <select
                    value={investor.investor_type || ""}
                    onChange={e => set("investor_type", e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t("dashboard.selectDots")}</option>
                    {[
                      { value: "angel",         labelKey: "dashboard.itAngel" },
                      { value: "vc",            labelKey: "dashboard.itVc"    },
                      { value: "family_office", labelKey: "dashboard.itFo"    },
                      { value: "corporate",     labelKey: "dashboard.itCorp"  },
                      { value: "syndicate",     labelKey: "dashboard.itSynd"  },
                    ].map(it => (
                      <option key={it.value} value={it.value}>{t(it.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className={FIELD_LABEL}>{t("dashboard.portfolioCount")}</Label>
                  <Input
                    type="number"
                    value={investor.portfolio_count ?? ""}
                    onChange={e => set("portfolio_count", e.target.value)}
                    className="font-mono"
                    placeholder="e.g. 12"
                  />
                </div>
              </div>
              {/* Same treatment as the lead-rounds toggle: rule, not box. */}
              <div className="flex items-center justify-between gap-4 pt-4" style={{ borderTop: "1px solid var(--cr-rule)" }}>
                <div>
                  <p className="text-sm font-medium text-cr-ink">{t("dashboard.willingLead")}</p>
                  <p className="text-xs text-cr-i3">{t("dashboard.willingLeadSub")}</p>
                </div>
                <Switch
                  checked={!!investor.lead_investor}
                  onCheckedChange={v => set("lead_investor", v)}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.minCheck")}</Label>
                  <Input
                    type="number"
                    value={investor.check_size_min ?? ""}
                    onChange={e => set("check_size_min", e.target.value)}
                    className="font-mono"
                    placeholder="10000"
                  />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>{t("onboarding.inv.maxCheck")}</Label>
                  <Input
                    type="number"
                    value={investor.check_size_max ?? ""}
                    onChange={e => set("check_size_max", e.target.value)}
                    className="font-mono"
                    placeholder="500000"
                  />
                </div>
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
