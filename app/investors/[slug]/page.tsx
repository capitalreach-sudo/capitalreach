import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { TargetButton } from "@/components/investors/target-button";
import { resolveEntity } from "@/lib/membership";
import { createAdminClient } from "@/lib/supabase-server";
import { Footer } from "@/components/shared/footer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Linkedin, MapPin, DollarSign, Globe, Twitter,
  Briefcase, BookOpen, Eye, Pencil, Handshake, BadgeCheck } from "lucide-react";
import { formatCurrency, getInitials } from "@/lib/utils";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { Metadata } from "next";

interface Props { params: { slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("investors")
    .select("slug, type, bio, display_name, firm_name")
    .eq("slug", params.slug)
    .single();
  if (!data) return {};
  const name = data.display_name || data.slug;
  const firm = data.firm_name ? ` · ${data.firm_name}` : "";
  return {
    title: `${name}${firm} — Investor on CapitalReach`,
    description: data.bio || `${data.type} investor on CapitalReach`,
  };
}

export default async function InvestorProfilePage({ params }: Props) {
  const supabase = await createServerSupabaseClient();
  const t = await getTranslator(getLocale());

  const INVESTOR_TYPE_LABELS: Record<string, string> = {
    angel: t("investorProfile.angelInvestor"),
    vc: t("investorProfile.ventureCapital"),
    family_office: t("investorProfile.familyOffice"),
    corporate: t("investorProfile.corporateInvestor"),
  };

  // Reads `investors` only. This page is public, and `profiles` is not: it
  // holds emails, subscription tiers and Stripe ids, and is now restricted to
  // authenticated sessions (migration 019). Everything below already lived on
  // `investors` under its own column names -- the old owner:profiles(...) join
  // was reading a duplicate copy of the same data, and pulling `email` onto a
  // public page while it was at it.
  const { data: investor } = await supabase
    .from("investors")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (!investor) notFound();

  // Who is looking? Investors had no way to see their own listing as a founder
  // sees it -- the only view of their profile was the settings form, which
  // shows fields rather than the result. Knowing the viewer also lets the CTA
  // stop inviting people to do things that make no sense for them.
  const { data: { user } } = await supabase.auth.getUser();
  const isOwnProfile = !!user && user.id === investor.owner_id;

  // If the viewer is a founder, their own deal with this investor. Same rule
  // as the startup profile: fetched with the caller's client so RLS decides,
  // only the viewer's own deal, never shown to the public.
  type ViewerDeal = { id: string; status: string };
  let viewerDeal: ViewerDeal | null = null;
  // Founder viewers also get the target-list button (migration 031); RLS
  // scopes the lookup to the caller's own startup.
  let viewerIsFounder = false;
  let viewerTargeted = false;
  if (user && !isOwnProfile) {
    // resolveEntity rather than an owner_id lookup: team members managing the
    // raise get the same button and the same initial state as the owner --
    // /api/targets already treats them alike, and an owner-only check here
    // made the button lie to (or hide from) exactly the people invited to
    // help run the round. The target lookup goes through the service role for
    // the same reason; RLS on investor_targets covers only the owner.
    const membership = await resolveEntity(user.id, "startup");
    if (membership) {
      viewerIsFounder = true;
      const admin = createAdminClient();
      const [{ data: deal }, { data: target }] = await Promise.all([
        supabase
          .from("deals")
          .select("id, status")
          .match({ startup_id: membership.entityId, investor_id: investor.id })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("investor_targets")
          .select("id")
          .match({ startup_id: membership.entityId, investor_id: investor.id })
          .maybeSingle(),
      ]);
      viewerDeal = (deal as ViewerDeal | null) ?? null;
      viewerTargeted = !!target;
    }
  }

  const displayName = investor.display_name || investor.slug;
  const memberSince = investor.created_at
    ? new Date(investor.created_at).toLocaleDateString(getLocale(), { month: "long", year: "numeric" })
    : null;
  const portfolio: Array<{ name: string; stage?: string; outcome?: string }> =
    Array.isArray(investor.portfolio_json)
      ? (investor.portfolio_json as Array<{ name: string; stage?: string; outcome?: string }>).filter((c) => c?.name)
      : [];

  // Similar investors — others who overlap on industry or stage, so a founder
  // browsing one lead can find the rest of the shortlist without going back.
  const overlapIndustries = (investor.industries ?? []).slice(0, 6);
  const overlapStages = (investor.stages ?? []).slice(0, 6);
  let similar: Array<{ slug: string; display_name: string | null; firm_name: string | null; type: string; industries: string[] | null }> = [];
  if (overlapIndustries.length || overlapStages.length) {
    const admin = createAdminClient();
    const orParts: string[] = [];
    // Drop any value carrying a character that would break the PostgREST array
    // literal or the top-level .or() separator, then quote what remains.
    const safe = (arr: string[]) => arr.filter((v) => !/[{}"(),\\]/.test(v));
    const inds = safe(overlapIndustries);
    const stgs = safe(overlapStages);
    if (inds.length) orParts.push(`industries.ov.{${inds.map((v) => `"${v}"`).join(",")}}`);
    if (stgs.length) orParts.push(`stages.ov.{${stgs.map((v) => `"${v}"`).join(",")}}`);
    if (orParts.length) {
      const { data } = await admin
        .from("investors")
        .select("slug, display_name, firm_name, type, industries")
        .neq("id", investor.id)
        .or(orParts.join(","))
        .limit(4);
      similar = data ?? [];
    }
  }

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-12 max-w-3xl">

        {/* Back nav */}
        <Link href="/investors" className="inline-flex items-center gap-1.5 text-sm text-cr-i4 hover:text-cr-i2 mb-6 transition-colors">
          ← {t("investorProfile.back")}
        </Link>

        {/* ── Self-preview ──────────────────────────────────────────────────
            An investor's only previous view of their own listing was the
            settings form. This is the page founders actually judge them on. */}
        {isOwnProfile && (
          <div className="flex items-center justify-between gap-4 bg-cr-copper/10 border border-cr-copper/20 rounded-xl px-4 py-3 mb-6">
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="h-4 w-4 text-cr-copper flex-shrink-0" />
              <p className="text-sm text-cr-cu-l">{t("investorProfile.selfPreview")}</p>
            </div>
            <Link
              href="/dashboard/investor/settings"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-cr-copper hover:underline flex-shrink-0"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("investorProfile.editProfile")}
            </Link>
          </div>
        )}

        {/* ── Profile header ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-6 mb-8">
          <Avatar className="h-20 w-20 text-xl flex-shrink-0">
            <AvatarFallback className="bg-cr-copper/15 text-cr-cu-l text-2xl font-bold">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-cr-ink mb-0.5">
              {displayName}
              {investor.verified_at && (
                <span className="inline-flex items-center gap-1 ml-2 align-middle rounded border border-cr-copper/30 bg-cr-copper/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cr-copper">
                  <BadgeCheck className="h-3 w-3" /> {t("investors.verifiedBadge")}
                </span>
              )}
            </h1>
            {investor.firm_name && (
              <p className="text-cr-copper font-semibold text-sm mb-2">{investor.firm_name}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {viewerDeal && (
                // Same pill as the startup profile: the two ends of a deal
                // should both show it. Wording reuses the kanban's own column
                // labels so profile and pipeline never disagree.
                <Link
                  href="/deals"
                  className="inline-flex items-center gap-1.5 bg-cr-copper/10 border border-cr-copper/25 text-cr-copper rounded px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider no-underline"
                >
                  <Handshake className="h-3 w-3" />
                  {t("startupDetail.inYourPipeline")}{" — "}
                  {viewerDeal.status === "intro" ? t("deals.colIntro")
                    : viewerDeal.status === "due_diligence" ? t("dashboard.dueDiligence")
                    : viewerDeal.status === "term_sheet" ? t("deals.colTermSheet")
                    : viewerDeal.status === "closed" ? t("deals.colClosed")
                    : t("deals.colPassed")}
                </Link>
              )}
              {viewerIsFounder && (
                <TargetButton investorId={investor.id} initiallyTargeted={viewerTargeted} />
              )}
              {investor.booking_url && user && (
                <a href={investor.booking_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-cr-copper/10 border border-cr-copper/25 text-cr-copper rounded px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider no-underline">
                  {t("startupDetail.bookCall")}
                </a>
              )}
              <Badge variant="outline">{INVESTOR_TYPE_LABELS[investor.type] || investor.type}</Badge>
              {investor.subscription_tier !== "free" && (
                <Badge className="bg-cr-copper/15 text-cr-cu-l border-0">
                  {investor.subscription_tier === "pro_investor" ? t("investorProfile.tierProInvestor") :
                   investor.subscription_tier === "institutional" ? t("investorProfile.tierInstitutional") :
                   investor.subscription_tier}
                </Badge>
              )}
              {/* One badge per fact. lead_rounds and the profiles copy
                  (lead_investor) are the same flag, and investor_type was
                  rendering the raw enum ("family_office") directly beneath the
                  label-mapped version above. */}
              {investor.lead_rounds && (
                <Badge className="bg-emerald-100 text-emerald-700 border-0">{t("investors.leadsRounds")}</Badge>
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
                  <Globe className="h-4 w-4" /> {t("investorProfile.website")}
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
              <h2 className="font-semibold text-cr-cu-l text-sm">{t("investors.thesis")}</h2>
            </div>
            <p className="text-sm text-cr-cu-l leading-relaxed">{investor.investment_thesis}</p>
          </div>
        )}

        {/* ── Key stats row ─────────────────────────────────────────────── */}
        {(investor.aum || investor.number_of_investments || investor.avg_hold_period) && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {investor.aum && (
              <div className="bg-cr-paper border rounded-xl p-4 text-center">
                <p className="text-xs text-cr-i3 font-medium uppercase tracking-wide mb-1">{t("investorProfile.aumFundSize")}</p>
                <p className="text-lg font-bold text-cr-ink">{investor.aum}</p>
              </div>
            )}
            {investor.number_of_investments != null && (
              <div className="bg-cr-paper border rounded-xl p-4 text-center">
                <p className="text-xs text-cr-i3 font-medium uppercase tracking-wide mb-1">{t("investorProfile.investmentsLabel")}</p>
                <p className="text-lg font-bold text-cr-ink">{investor.number_of_investments}</p>
              </div>
            )}
            {investor.avg_hold_period && (
              <div className="bg-cr-paper border rounded-xl p-4 text-center">
                <p className="text-xs text-cr-i3 font-medium uppercase tracking-wide mb-1">{t("investorProfile.avgHold")}</p>
                <p className="text-lg font-bold text-cr-ink">{investor.avg_hold_period}</p>
              </div>
            )}
          </div>
        )}

        {/* A founder deciding whether to spend an intro on someone wants to
            know they are a real, established account. This is the only such
            signal the schema currently supports -- there is no last-active
            column, so it is not claimed. */}
        {memberSince && (
          <p className="text-xs text-cr-i4 mb-6 text-center">
            {t("investorProfile.memberSince", { date: memberSince })}
          </p>
        )}

        {/* ── Investor detail ───────────────────────────────────────────── */}
        {/* portfolio_count is deliberately not repeated here: it is the same
            number as number_of_investments, already shown in the stats row. */}
        {(investor.min_check || investor.max_check || investor.languages?.length || investor.board_seat_pref || investor.follow_on_policy) && (
          <div className="bg-cr-paper border rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-cr-ink mb-4">{t("investorProfile.investorDetail")}</h2>
            <div className="grid grid-cols-2 gap-4">
              {(investor.min_check || investor.max_check) && (
                <div>
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-1">{t("investors.checkSize")}</p>
                  <p className="font-mono font-semibold text-cr-ink">
                    {investor.min_check ? formatCurrency(investor.min_check, true) : "—"}
                    {" – "}
                    {investor.max_check ? formatCurrency(investor.max_check, true) : t("common.open")}
                  </p>
                </div>
              )}
              {investor.board_seat_pref && (
                <div>
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-1">{t("investorProfile.boardSeat")}</p>
                  <p className="text-sm text-cr-ink">{investor.board_seat_pref}</p>
                </div>
              )}
              {investor.follow_on_policy && (
                <div>
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-1">{t("investorProfile.followOn")}</p>
                  <p className="text-sm text-cr-ink">{investor.follow_on_policy}</p>
                </div>
              )}
              {(investor.languages ?? []).length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-2">{t("investorProfile.languagesLabel")}</p>
                  <div className="flex flex-wrap gap-2">
                    {(investor.languages ?? []).map((lang: string) => (
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
          <h2 className="font-semibold text-cr-ink">{t("investorProfile.investmentPreferences")}</h2>

          {investor.industries?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-2">{t("investorProfile.industriesLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {investor.industries.map((ind: string) => (
                  <span key={ind} className="text-xs bg-cr-p3 text-cr-i2 px-2.5 py-1 rounded-full">{ind}</span>
                ))}
              </div>
            </div>
          )}

          {investor.stages?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-2">{t("investorProfile.stagesLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {investor.stages.map((s: string) => (
                  <span key={s} className="text-xs bg-blue-100 text-blue-400 px-2.5 py-1 rounded-full capitalize">
                    {s.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Check size is deliberately not repeated here. It is already shown,
              better formatted, in the Investor Detail block above -- this was a
              second rendering of the same two columns. */}

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
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-1">{t("investorProfile.followOnPolicy")}</p>
                  <p className="text-sm text-cr-i2">{investor.follow_on_policy}</p>
                </div>
              )}
              {investor.board_seat_pref && (
                <div>
                  <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-1">{t("investorProfile.boardPreference")}</p>
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
              <h2 className="font-semibold text-cr-ink">{t("investorProfile.portfolioCompanies")}</h2>
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

        {/* ── Similar investors ── */}
        {similar.length > 0 && (
          <div className="mt-8 pt-6 border-t border-cr-p4">
            <p className="text-xs font-semibold text-cr-i3 uppercase tracking-wide mb-3">{t("investorProfile.similarInvestors")}</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {similar.map((s) => (
                <a key={s.slug} href={`/investors/${s.slug}`} className="bg-cr-paper border rounded-xl p-4 hover:border-cr-copper transition-colors">
                  <p className="font-semibold text-cr-ink text-sm truncate">{s.display_name || s.firm_name || s.slug}</p>
                  <p className="text-xs text-cr-i4 mt-0.5 capitalize">{s.type}{s.firm_name && s.display_name ? ` · ${s.firm_name}` : ""}</p>
                  {(s.industries ?? []).length > 0 && (
                    <p className="text-xs text-cr-i3 mt-1.5 truncate">{(s.industries ?? []).slice(0, 3).join(", ")}</p>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── CTA ───────────────────────────────────────────────────────────
            Only shown to signed-out visitors. It previously invited everyone to
            sign up as a startup, including the investor viewing their own page
            and founders who already have a listing. */}
        {!user && (
          <div className="mt-4 text-center">
            <p className="text-cr-i3 text-sm mb-4">
              {t("investorProfile.founderCta", { name: displayName })}
            </p>
            <a href="/auth/signup?role=startup" className="text-cr-copper font-medium hover:underline">
              {t("investors.listYourStartup")} →
            </a>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
