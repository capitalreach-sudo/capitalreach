"use client";

import { useEffect, useState, useRef } from "react";
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
import { ArrowLeft, Save, X, Plus, Globe } from "lucide-react";
import { LanguageSettingsSelector } from "@/components/ui/LanguageSettingsSelector";
import Link from "next/link";
import { INDUSTRIES, STAGES } from "@/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

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
    <div className="border rounded-lg p-2 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-cr-copper bg-cr-paper min-h-[42px]">
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-cr-copper/15 text-cr-cu-l text-xs px-2 py-1 rounded-full font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="hover:text-cr-cu-l ml-0.5"
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
          className="flex-1 min-w-[120px] text-sm outline-none bg-transparent placeholder:text-cr-i4 py-0.5 px-1"
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
    <div className="space-y-2">
      {portfolio.map((co, i) => (
        <div key={i} className="flex gap-2 items-start">
          <Input
            value={co.name}
            onChange={e => update(i, "name", e.target.value)}
            placeholder={t("onboarding.inv.companyNamePh")}
            className="flex-1"
          />
          <Input
            value={co.stage || ""}
            onChange={e => update(i, "stage", e.target.value)}
            placeholder={t("dashboard.phStage")}
            className="w-32"
          />
          <Input
            value={co.outcome || ""}
            onChange={e => update(i, "outcome", e.target.value)}
            placeholder={t("dashboard.phOutcome")}
            className="w-36"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-cr-i4 hover:text-red-500 mt-2.5 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5 text-xs">
        <Plus className="h-3.5 w-3.5" /> {t("onboarding.inv.addCompany")}
      </Button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function InvestorSettingsPage() {
  const { t } = useTranslation();
  const [investor, setInvestor] = useState<any>(null);
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
        supabase.from("profiles").select("investor_type,portfolio_count,lead_investor,check_size_min,check_size_max,languages").eq("id", user.id).single(),
      ]);
      if (data) {
        // Ensure arrays / json default properly
        data.industries = data.industries || [];
        data.stages = data.stages || [];
        data.geography = data.geography || [];
        data.portfolio_json = Array.isArray(data.portfolio_json) ? data.portfolio_json : [];
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

  if (loading) return <><Navbar /><div className="flex items-center justify-center h-64 text-cr-i4">{t("common.loading")}</div></>;
  if (!investor) return <><Navbar /><div className="text-center py-20">{t("dashboard.noInvestorProfile")}</div></>;

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/investor">
            <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Button>
          </Link>
          <h1 className="text-2xl font-bold text-cr-ink">{t("dashboard.investorSettings")}</h1>
        </div>

        <form onSubmit={handleSave} className="space-y-6">

          {/* ── Identity ──────────────────────────────────────────────────── */}
          <div className="bg-cr-paper border rounded-2xl p-6">
            <h2 className="font-semibold text-cr-ink mb-4">{t("dashboard.secIdentity")}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("dashboard.displayName")}</Label>
                  <Input
                    value={investor.display_name || ""}
                    onChange={e => set("display_name", e.target.value)}
                    placeholder={t("dashboard.displayNamePh")}
                  />
                </div>
                <div>
                  <Label>{t("onboarding.inv.firmName")}</Label>
                  <Input
                    value={investor.firm_name || ""}
                    onChange={e => set("firm_name", e.target.value)}
                    placeholder="Sequoia Capital"
                  />
                </div>
              </div>
              <div>
                <Label>{t("onboarding.inv.shortBio")}</Label>
                <Textarea
                  value={investor.bio || ""}
                  onChange={e => set("bio", e.target.value)}
                  className="h-24"
                  placeholder="Angel investor focused on B2B SaaS at the pre-seed stage…"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("onboarding.inv.website")}</Label>
                  <Input
                    value={investor.website || ""}
                    onChange={e => set("website", e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <Label>{t("onboarding.inv.linkedin")}</Label>
                  <Input
                    value={investor.linkedin_url || ""}
                    onChange={e => set("linkedin_url", e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                  />
                </div>
              </div>
              <div>
                <Label>{t("onboarding.inv.twitterX")}</Label>
                <Input
                  value={investor.twitter_url || ""}
                  onChange={e => set("twitter_url", e.target.value)}
                  placeholder="https://x.com/…"
                />
              </div>
            </div>
          </div>

          {/* ── Investment Details ─────────────────────────────────────────── */}
          <div className="bg-cr-paper border rounded-2xl p-6">
            <h2 className="font-semibold text-cr-ink mb-4">{t("dashboard.secInvestmentDetails")}</h2>
            <div className="space-y-4">
              <div>
                <Label>{t("onboarding.inv.thesis")}</Label>
                <Textarea
                  value={investor.investment_thesis || ""}
                  onChange={e => set("investment_thesis", e.target.value)}
                  className="h-24"
                  placeholder="We back technical founders solving hard problems in regulated industries…"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("onboarding.inv.aumLabel")}</Label>
                  <Input
                    value={investor.aum || ""}
                    onChange={e => set("aum", e.target.value)}
                    placeholder="e.g. $50M"
                  />
                </div>
                <div>
                  <Label>{t("onboarding.inv.numInvestments")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={investor.number_of_investments ?? ""}
                    onChange={e => set("number_of_investments", e.target.value)}
                    placeholder="e.g. 24"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("onboarding.inv.holdPeriod")}</Label>
                  <Input
                    value={investor.avg_hold_period || ""}
                    onChange={e => set("avg_hold_period", e.target.value)}
                    placeholder="e.g. 5–7 years"
                  />
                </div>
                <div>
                  <Label>{t("onboarding.inv.followOn")}</Label>
                  <Input
                    value={investor.follow_on_policy || ""}
                    onChange={e => set("follow_on_policy", e.target.value)}
                    placeholder="e.g. Pro-rata rights"
                  />
                </div>
              </div>
              <div>
                <Label>{t("onboarding.inv.boardPref")}</Label>
                <Input
                  value={investor.board_seat_pref || ""}
                  onChange={e => set("board_seat_pref", e.target.value)}
                  placeholder="e.g. Observer seat preferred"
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm text-cr-ink">{t("dashboard.leadRoundsLabel")}</p>
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
          <div className="bg-cr-paper border rounded-2xl p-6">
            <h2 className="font-semibold text-cr-ink mb-1">{t("onboarding.inv.portfolioLabel")}</h2>
            <p className="text-xs text-cr-i3 mb-4">{t("dashboard.portfolioSub")}</p>
            <PortfolioEditor
              portfolio={investor.portfolio_json || []}
              onChange={p => set("portfolio_json", p)}
            />
          </div>

          {/* ── Investment Preferences ─────────────────────────────────────── */}
          <div className="bg-cr-paper border rounded-2xl p-6">
            <h2 className="font-semibold text-cr-ink mb-4">{t("onboarding.inv.h2")}</h2>
            <div className="space-y-5">
              <div>
                <Label className="text-sm font-semibold mb-2 block">{t("dashboard.industriesLabel")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {INDUSTRIES.map(ind => (
                    <label key={ind} className="flex items-center gap-2 cursor-pointer">
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
                <Label className="text-sm font-semibold mb-2 block">{t("dashboard.stagesLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  {STAGES.map(s => (
                    <button
                      type="button"
                      key={s.value}
                      onClick={() => toggleArr("stages", s.value)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full border transition-colors",
                        (investor.stages || []).includes(s.value)
                          ? "bg-cr-cu-d text-white border-cr-cu-d"
                          : "border-cr-p4 text-cr-i3 hover:border-cr-i4"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("onboarding.inv.minCheck")}</Label>
                  <Input
                    type="number"
                    value={investor.min_check || ""}
                    onChange={e => set("min_check", e.target.value)}
                    placeholder="25000"
                  />
                </div>
                <div>
                  <Label>{t("onboarding.inv.maxCheck")}</Label>
                  <Input
                    type="number"
                    value={investor.max_check || ""}
                    onChange={e => set("max_check", e.target.value)}
                    placeholder="500000"
                  />
                </div>
              </div>

              <div>
                <Label className="block mb-1.5">{t("onboarding.inv.geography")}</Label>
                <p className="text-xs text-cr-i3 mb-2">{t("dashboard.geoHintEnter")}</p>
                <TagInput
                  tags={investor.geography || []}
                  onChange={tags => set("geography", tags)}
                  placeholder="United States, Europe, Global…"
                />
              </div>
            </div>
          </div>

          {/* ── Richer Profile Fields (Feature 3) ─────────────────────── */}
          <div className="bg-cr-paper border rounded-2xl p-6">
            <h2 className="font-semibold text-cr-ink mb-1">{t("dashboard.secProfileDetail")}</h2>
            <p className="text-xs text-cr-i3 mb-4">{t("dashboard.profileDetailSub")}</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("onboarding.inv.step1")}</Label>
                  <select
                    value={investor.investor_type || ""}
                    onChange={e => set("investor_type", e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  >
                    <option value="">{t("dashboard.selectDots")}</option>
                    {[
                      { value: "Angel",         labelKey: "dashboard.itAngel" },
                      { value: "VC",            labelKey: "dashboard.itVc"    },
                      { value: "Family Office", labelKey: "dashboard.itFo"    },
                      { value: "Corporate",     labelKey: "dashboard.itCorp"  },
                      { value: "Syndicate",     labelKey: "dashboard.itSynd"  },
                    ].map(it => (
                      <option key={it.value} value={it.value}>{t(it.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{t("dashboard.portfolioCount")}</Label>
                  <Input
                    type="number"
                    value={investor.portfolio_count ?? ""}
                    onChange={e => set("portfolio_count", e.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm text-cr-ink">{t("dashboard.willingLead")}</p>
                  <p className="text-xs text-cr-i3">{t("dashboard.willingLeadSub")}</p>
                </div>
                <Switch
                  checked={!!investor.lead_investor}
                  onCheckedChange={v => set("lead_investor", v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("onboarding.inv.minCheck")}</Label>
                  <Input
                    type="number"
                    value={investor.check_size_min ?? ""}
                    onChange={e => set("check_size_min", e.target.value)}
                    placeholder="10000"
                  />
                </div>
                <div>
                  <Label>{t("onboarding.inv.maxCheck")}</Label>
                  <Input
                    type="number"
                    value={investor.check_size_max ?? ""}
                    onChange={e => set("check_size_max", e.target.value)}
                    placeholder="500000"
                  />
                </div>
              </div>
              <div>
                <Label className="block mb-1.5">{t("dashboard.languagesSpoken")}</Label>
                <TagInput
                  tags={investor.languages || []}
                  onChange={tags => set("languages", tags)}
                  placeholder="English, German, French…"
                />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? t("common.saving") : t("dashboard.saveAll")}
          </Button>
        </form>

        {/* Language section (outside form — has its own save) */}
        <section className="bg-cr-paper border rounded-2xl p-6 mt-6">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-cr-copper" />
            <h2 className="font-semibold text-cr-ink">{t("settings.language")}</h2>
          </div>
          <p className="text-sm text-cr-i3 mb-4">
            {t("settings.languageDesc")}
          </p>
          <LanguageSettingsSelector />
        </section>
      </main>
    </>
  );
}
