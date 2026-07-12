import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Linkedin, MapPin, DollarSign, Globe, Twitter,
  Briefcase, TrendingUp, BookOpen, Users, Clock,
} from "lucide-react";
import { formatCurrency, getInitials } from "@/lib/utils";
import type { Metadata } from "next";

interface Props { params: { slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("investors")
    .select("slug, type, bio, display_name, firm_name, owner:profiles(full_name)")
    .eq("slug", params.slug)
    .single();
  if (!data) return {};
  const name = data.display_name || (data.owner as any)?.full_name || data.slug;
  const firm = data.firm_name ? ` · ${data.firm_name}` : "";
  return {
    title: `${name}${firm} — Investor on CapitalReach`,
    description: data.bio || `${data.type} investor on CapitalReach`,
  };
}

const INVESTOR_TYPE_LABELS: Record<string, string> = {
  angel: "Angel Investor",
  vc: "Venture Capital",
  family_office: "Family Office",
  corporate: "Corporate Investor",
};

export default async function InvestorProfilePage({ params }: Props) {
  const supabase = await createServerSupabaseClient();

  const { data: investor } = await supabase
    .from("investors")
    .select(`*, owner:profiles(
      full_name, avatar_url, email,
      investment_thesis, check_size_min, check_size_max,
      preferred_stages, preferred_industries, preferred_countries,
      investor_type, portfolio_count, lead_investor, languages
    )`)
    .eq("slug", params.slug)
    .single();

  if (!investor) notFound();

  const ownerProfile = investor.owner as any;
  const displayName = investor.display_name || ownerProfile?.full_name || investor.slug;
  const portfolio: Array<{ name: string; stage?: string; outcome?: string }> =
    Array.isArray(investor.portfolio_json) ? investor.portfolio_json.filter((c: any) => c?.name) : [];

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-12 max-w-3xl">

        {/* Back nav */}
        <Link href="/investors" className="inline-flex items-center gap-1.5 text-sm text-cr-i4 hover:text-cr-i2 mb-6 transition-colors">
          ← Back to investors
        </Link>

        {/* ── Profile header ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-6 mb-8">
          <Avatar className="h-20 w-20 text-xl flex-shrink-0">
            <AvatarFallback className="bg-cr-copper/15 text-cr-cu-l text-2xl font-bold">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-cr-ink mb-0.5">{displayName}</h1>
            {investor.firm_name && (
              <p className="text-cr-copper font-semibold text-sm mb-2">{investor.firm_name}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Badge variant="outline">{INVESTOR_TYPE_LABELS[investor.type] || investor.type}</Badge>
              {investor.subscription_tier !== "free" && (
                <Badge className="bg-cr-copper/15 text-cr-cu-l border-0">
                  {investor.subscription_tier === "pro_investor" ? "Pro Investor" :
                   investor.subscription_tier === "institutional" ? "Institutional" :
                   investor.subscription_tier}
                </Badge>
              )}
              {investor.lead_rounds && (
                <Badge className="bg-emerald-100 text-emerald-700 border-0">Leads rounds</Badge>
              )}
              {ownerProfile?.lead_investor && (
                <Badge style={{ background: "var(--cr-copper-bg)", color: "var(--cr-copper)", border: "1px solid var(--cr-copper-br)" }}>
                  Leads rounds
                </Badge>
              )}
              {ownerProfile?.investor_type && (
                <Badge variant="outline">{ownerProfile.investor_type}</Badge>
              )}
            </div>
            {investor.bio && (
              <p className="text-cr-i3 leading-relaxed text-sm">{investor.bio}</p>
            )}

            {/* Social / web links */}
            <div className="flex flex-wrap gap-3 mt-3">
              {investor.linkedin_url && (
                <a href={investor.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                  <Linkedin className="h-4 w-4" /> LinkedIn
                </a>
              )}
              {investor.twitter_url && (
                <a href={investor.twitter_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-sky-500 hover:underline">
                  <Twitter className="h-4 w-4" /> Twitter / X
                </a>
              )}
              {investor.website && (
                <a href={investor.website} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-cr-i3 hover:underline">
                  <Globe className="h-4 w-4" /> Website
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── Investment thesis ──────────────────────────────────────────── */}
        {investor.investment_thesis && (
          <div className="bg-cr-copper/10 border border-cr-copper/20 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-cr-copper" />
              <h2 className="font-semibold text-cr-cu-l text-sm">Investment Thesis</h2>
            </div>
            <p className="text-sm text-cr-cu-l leading-relaxed">{investor.investment_thesis}</p>
          </div>
        )}

        {/* ── Key stats row ─────────────────────────────────────────────── */}
        {(investor.aum || investor.number_of_investments || investor.avg_hold_period) && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {investor.aum && (
              <div className="bg-cr-paper border rounded-xl p-4 text-center">
                <p className="text-xs text-cr-i3 font-medium uppercase tracking-wide mb-1">AUM / Fund Size</p>
                <p className="text-lg font-bold text-cr-ink">{investor.aum}</p>
              </div>
            )}
            {investor.number_of_investments != null && (
              <div className="bg-cr-paper border rounded-xl p-4 text-center">
                <p className="text-xs text-cr-i3 font-medium uppercase tracking-wide mb-1">Investments</p>
                <p className="text-lg font-bold text-cr-ink">{investor.number_of_investments}</p>
              </div>
            )}
            {investor.avg_hold_period && (
              <div className="bg-cr-paper border rounded-xl p-4 text-center">
                <p className="text-xs text-cr-i3 font-medium uppercase tracking-wide mb-1">Avg Hold</p>
                <p className="text-lg font-bold text-cr-ink">{investor.avg_hold_period}</p>
              </div>
            )}
          </div>
        )}

        {/* ── New profile detail stats ───────────────────────────────────── */}
        {(ownerProfile?.check_size_min || ownerProfile?.check_size_max || ownerProfile?.portfolio_count || ownerProfile?.languages?.length) && (
          <div className="bg-cr-paper border rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-cr-ink mb-4">Investor Detail</h2>
            <div className="grid grid-cols-2 gap-4">
              {(ownerProfile?.check_size_min || ownerProfile?.check_size_max) && (
                <div>
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-1">Check Size</p>
                  <p className="font-mono font-semibold text-cr-ink">
                    {ownerProfile.check_size_min ? formatCurrency(ownerProfile.check_size_min, true) : "—"}
                    {" – "}
                    {ownerProfile.check_size_max ? formatCurrency(ownerProfile.check_size_max, true) : "Open"}
                  </p>
                </div>
              )}
              {ownerProfile?.portfolio_count != null && (
                <div>
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-1">Portfolio</p>
                  <p className="font-mono font-semibold text-cr-ink">{ownerProfile.portfolio_count} investments</p>
                </div>
              )}
              {ownerProfile?.languages?.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-2">Languages</p>
                  <div className="flex flex-wrap gap-2">
                    {ownerProfile.languages.map((lang: string) => (
                      <span key={lang} className="text-xs bg-cr-p3 text-cr-i2 px-2.5 py-1 rounded-full">{lang}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Investment preferences ─────────────────────────────────────── */}
        <div className="bg-cr-paper border rounded-xl p-6 space-y-5 mb-6">
          <h2 className="font-semibold text-cr-ink">Investment Preferences</h2>

          {investor.industries?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-2">Industries</p>
              <div className="flex flex-wrap gap-2">
                {investor.industries.map((ind: string) => (
                  <span key={ind} className="text-xs bg-cr-p3 text-cr-i2 px-2.5 py-1 rounded-full">{ind}</span>
                ))}
              </div>
            </div>
          )}

          {investor.stages?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-2">Stages</p>
              <div className="flex flex-wrap gap-2">
                {investor.stages.map((s: string) => (
                  <span key={s} className="text-xs bg-blue-100 text-blue-400 px-2.5 py-1 rounded-full capitalize">
                    {s.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(investor.min_check || investor.max_check) && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-cr-i4" />
              <span className="text-sm text-cr-i2">
                {investor.min_check ? formatCurrency(investor.min_check, true) : "Open"}{" "}–{" "}
                {investor.max_check ? formatCurrency(investor.max_check, true) : "Open"} check size
              </span>
            </div>
          )}

          {investor.geography?.length > 0 && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-cr-i4 mt-0.5 flex-shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {investor.geography.map((g: string) => (
                  <span key={g} className="text-xs bg-cr-p3 text-cr-i2 px-2 py-0.5 rounded-full">{g}</span>
                ))}
              </div>
            </div>
          )}

          {(investor.follow_on_policy || investor.board_seat_pref) && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              {investor.follow_on_policy && (
                <div>
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-1">Follow-On Policy</p>
                  <p className="text-sm text-cr-i2">{investor.follow_on_policy}</p>
                </div>
              )}
              {investor.board_seat_pref && (
                <div>
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-1">Board Preference</p>
                  <p className="text-sm text-cr-i2">{investor.board_seat_pref}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Portfolio companies ────────────────────────────────────────── */}
        {portfolio.length > 0 && (
          <div className="bg-cr-paper border rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="h-4 w-4 text-cr-i4" />
              <h2 className="font-semibold text-cr-ink">Portfolio Companies</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {portfolio.map((co, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-cr-p2 rounded-lg border">
                  <span className="text-sm font-medium text-cr-ink">{co.name}</span>
                  <div className="flex gap-1.5">
                    {co.stage && (
                      <span className="text-xs bg-blue-100 text-blue-400 px-2 py-0.5 rounded-full">{co.stage}</span>
                    )}
                    {co.outcome && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{co.outcome}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <div className="mt-4 text-center">
          <p className="text-cr-i3 text-sm mb-4">
            Are you a founder? Create your profile on CapitalReach to get in front of investors like {displayName}.
          </p>
          <a href="/auth/signup?role=startup" className="text-cr-copper font-medium hover:underline">
            List your startup →
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
