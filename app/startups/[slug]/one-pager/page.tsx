import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { PrintButton } from "@/components/ui/PrintButton";
import { safeFormatCurrencyAmount, safeFormatMRR } from "@/lib/validators";
import { formatCurrency, STAGE_LABELS } from "@/lib/utils";
import { roundCloseState } from "@/lib/round-close";
import { protectFounders } from "@/lib/identity";
import { listingDetailPublic } from "@/lib/listing-visibility";
import { buildAccessContext, investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import { viewerCanSeeFinancials } from "@/lib/browse-data";

/**
 * The one-pager: the single sheet investors ask for by email.
 *
 * A deliberately print-first page — File → Print → Save as PDF is the export,
 * so there is no PDF library to maintain and the output always matches what
 * the screen shows. Everything on it is content the public listing already
 * shows to a signed-out visitor: no documents, no financial gates crossed —
 * a founder can forward the PDF without thinking about who may see it,
 * because the answer is "anyone" by construction.
 *
 * Layout is sized to one A4/Letter page for a typical listing: two columns,
 * tight leading, no images beyond the initial block. If a founder writes a
 * thousand-word problem statement it will spill to two pages — the fix for
 * that is editing, not clipping their words for them.
 */
interface Props {
  params: { slug: string };
  searchParams?: { share?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `One-pager — ${params.slug}`, robots: { index: false } };
}

export default async function OnePagerPage({ params, searchParams }: Props) {
  const supabase = await createServerSupabaseClient();

  // The printable sheet carries the whole pitch -- problem, solution, market,
  // competitive advantage, use of funds. That is the same idea the detail
  // page now withholds from anonymous readers, and this URL is derivable
  // from any slug on the public index, so gating one without the other left
  // the front door locked and the side door open. Same rule, same exemption
  // for a founder's own share link.
  const { data: { user: gateUser } } = await supabase.auth.getUser();
  if (!gateUser && !(await listingDetailPublic())) {
    const gateToken = typeof searchParams?.share === "string" ? searchParams.share.slice(0, 64) : null;
    let sharedWithGuest = false;
    if (gateToken) {
      const { data: gateShare } = await createAdminClient()
        .from("round_shares")
        .select("startup_id, expires_at, revoked_at, startup:startups!inner(slug)")
        .eq("token", gateToken)
        .maybeSingle();
      const shareSlug = Array.isArray(gateShare?.startup)
        ? (gateShare?.startup as Array<{ slug: string }>)[0]?.slug
        : (gateShare?.startup as { slug: string } | null | undefined)?.slug;
      sharedWithGuest = !!gateShare
        && shareSlug === params.slug
        && !gateShare.revoked_at
        && (!gateShare.expires_at || new Date(gateShare.expires_at) > new Date());
    }
    if (!sharedWithGuest) redirect(`/auth/login?redirect=/startups/${params.slug}/one-pager`);
  }

  // Service-role read; the entitlement strip below governs what renders.
  const { data: startup } = await createAdminClient()
    .from("startups")
    .select(`
      name, slug, tagline, industry, stage, country, website, status,
      funding_target, equity_offered, min_check_size, round_close_date,
      mrr, arr, growth_rate, runway_months, team_size, paying_customers, user_count,
      problem, solution, market, competitive_advantage, use_of_funds,
      founders:startup_founders(name, role)
    `)
    .eq("slug", params.slug)
    .eq("status", "active")
    .single();

  if (!startup) notFound();

  // Identity protection (Phase 1): the printable one-pager is the easiest
  // artefact to hand around, so founder names are masked ("Sarah K.") unless
  // the viewer owns the listing, is an admin, or has a live deal on it.
  const { data: { user } } = await supabase.auth.getUser();
  let reveal = false;
  if (user) {
    const [{ data: owner }, { data: prof }, { data: inv }] = await Promise.all([
      supabase.from("startups").select("owner_id").eq("slug", params.slug).maybeSingle(),
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase.from("investors").select("id").eq("owner_id", user.id).maybeSingle(),
    ]);
    reveal = owner?.owner_id === user.id || prof?.role === "admin";
    if (!reveal && inv?.id && owner) {
      const { data: st } = await supabase.from("startups").select("id").eq("slug", params.slug).maybeSingle();
      if (st) {
        const { data: deal } = await supabase.from("deals").select("id").match({ startup_id: st.id, investor_id: inv.id }).neq("status", "passed").limit(1).maybeSingle();
        reveal = !!deal;
      }
    }
  }
  // Financials and the founder roster sit behind the SAME tier gate as the
  // detail page (audit finding: this sheet rendered MRR/ARR/runway and the
  // team to anonymous visitors while the listing page stripped them). The
  // sheet stays printable by anyone; gated numbers just are not on it
  // unless the viewer is entitled (owner, admin, deal party, or paid tier).
  const gatedOk = reveal || (await viewerCanSeeFinancials());
  if (!gatedOk) {
    startup.mrr = null; startup.arr = null; startup.growth_rate = null;
    startup.runway_months = null; startup.paying_customers = null; startup.user_count = null;
  }
  const founders = gatedOk ? protectFounders(startup.founders ?? [], reveal) : [];

  // The detail page walls the PITCH off from a signed-in free member, and this
  // sheet carries the same prose -- problem, solution, market, use of funds.
  // Gating one and not the other left the wall with a door beside it.
  if (gateUser && !reveal) {
    const { data: prof } = await createAdminClient()
      .from("profiles").select("role, subscription_tier, suspended").eq("id", gateUser.id).maybeSingle();
    if (prof && prof.role !== "admin" && prof.role !== "startup") {
      const { isLaunch } = await getLaunchStatus();
      const caps = investorCan(buildAccessContext(prof as Parameters<typeof buildAccessContext>[0], isLaunch));
      if (!caps.viewListingDetail) redirect(`/startups/${params.slug}`);
    }
  }

  const closing = roundCloseState(startup.round_close_date);
  const metrics: Array<[string, string]> = [];
  if (startup.mrr) metrics.push(["MRR", safeFormatMRR(startup.mrr)]);
  if (startup.arr) metrics.push(["ARR", safeFormatMRR(startup.arr)]);
  if (startup.growth_rate) metrics.push(["Growth", `${startup.growth_rate}% m/m`]);
  if (startup.runway_months) metrics.push(["Runway", `${startup.runway_months} mo`]);
  if (startup.paying_customers) metrics.push(["Customers", String(startup.paying_customers)]);
  if (startup.user_count) metrics.push(["Users", String(startup.user_count)]);
  if (startup.team_size) metrics.push(["Team", startup.team_size]);

  const sections: Array<[string, string | null]> = [
    ["Problem", startup.problem],
    ["Solution", startup.solution],
    ["Market", startup.market],
    ["Edge", startup.competitive_advantage],
    ["Use of funds", startup.use_of_funds],
  ];

  const label: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", letterSpacing: "0.12em",
    textTransform: "uppercase", color: "var(--cr-copper)", marginBottom: "4px",
  };

  return (
    <main style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>
      {/* Screen chrome only; vanishes in print. */}
      <div className="print:hidden" style={{ maxWidth: "760px", margin: "0 auto", padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <Link href={`/startups/${startup.slug}`} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-3)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
          ← {startup.name}
        </Link>
        <PrintButton label="Save as PDF" />
      </div>

      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "28px 24px 60px" }}>
        {/* ── Masthead ── */}
        <div style={{ borderBottom: "3px solid var(--cr-copper)", paddingBottom: "16px", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: "34px", color: "var(--cr-ink)" }}>
              {startup.name}
            </h1>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)" }}>
              {[STAGE_LABELS[startup.stage] ?? startup.stage, startup.industry, startup.country].filter(Boolean).join(" · ")}
            </p>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-2)", marginTop: "4px" }}>
            {startup.tagline}
          </p>
        </div>

        {/* ── The ask ── */}
        <div style={{ display: "flex", gap: "28px", flexWrap: "wrap", marginBottom: "20px" }}>
          <div>
            <p style={label}>Raising</p>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "24px", color: "var(--cr-copper)" }}>
              {safeFormatCurrencyAmount(startup.funding_target)}
            </p>
          </div>
          {startup.equity_offered != null && startup.equity_offered > 0 && (
            <div>
              <p style={label}>Equity</p>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)" }}>{startup.equity_offered}%</p>
            </div>
          )}
          {startup.min_check_size != null && startup.min_check_size > 0 && (
            <div>
              <p style={label}>Min. check</p>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "24px", color: "var(--cr-ink)" }}>
                {formatCurrency(startup.min_check_size, true)}
              </p>
            </div>
          )}
          {closing && (
            <div>
              <p style={label}>Closes</p>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "24px", color: "var(--cr-copper)" }}>
                {closing.kind === "closingSoon" ? "soon" : `${closing.days}d`}
              </p>
            </div>
          )}
        </div>

        {/* ── Traction ── */}
        {metrics.length > 0 && (
          <div style={{ display: "flex", gap: "0", flexWrap: "wrap", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", marginBottom: "20px" }}>
            {metrics.map(([k, v], i) => (
              <div key={k} style={{ flex: "1 1 100px", padding: "10px 14px", borderInlineStart: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
                <p style={label}>{k}</p>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "16px", color: "var(--cr-ink)" }}>{v}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Narrative, two columns on paper and screen alike ── */}
        <div className="one-pager-cols">
          {sections.filter(([, body]) => body?.trim()).map(([title, body]) => (
            <div key={title} style={{ breakInside: "avoid", marginBottom: "16px" }}>
              <p style={label}>{title}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px", lineHeight: 1.65, color: "var(--cr-ink-2)", whiteSpace: "pre-wrap" }}>
                {body}
              </p>
            </div>
          ))}
          {founders.length > 0 && (
            <div style={{ breakInside: "avoid", marginBottom: "16px" }}>
              <p style={label}>Founders</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px", lineHeight: 1.65, color: "var(--cr-ink-2)" }}>
                {founders.map((f) => [f.name, f.role].filter(Boolean).join(" — ")).join("\n")}
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: "1px solid var(--cr-rule-dark)", marginTop: "8px", paddingTop: "10px", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)" }}>
            {startup.website ?? ""}
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)" }}>
            Full profile, deck and data room: capitalreach.vercel.app/startups/{startup.slug}
          </p>
        </div>
      </div>
    </main>
  );
}
