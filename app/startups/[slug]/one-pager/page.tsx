import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PrintButton } from "@/components/ui/PrintButton";
import { safeFormatCurrencyAmount, safeFormatMRR } from "@/lib/validators";
import { formatCurrency, STAGE_LABELS } from "@/lib/utils";
import { roundCloseState } from "@/lib/round-close";

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
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `One-pager — ${params.slug}`, robots: { index: false } };
}

export default async function OnePagerPage({ params }: Props) {
  const supabase = await createServerSupabaseClient();

  const { data: startup } = await supabase
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
        <div style={{ columnCount: 2, columnGap: "28px" }}>
          {sections.filter(([, body]) => body?.trim()).map(([title, body]) => (
            <div key={title} style={{ breakInside: "avoid", marginBottom: "16px" }}>
              <p style={label}>{title}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px", lineHeight: 1.65, color: "var(--cr-ink-2)", whiteSpace: "pre-wrap" }}>
                {body}
              </p>
            </div>
          ))}
          {(startup.founders?.length ?? 0) > 0 && (
            <div style={{ breakInside: "avoid", marginBottom: "16px" }}>
              <p style={label}>Founders</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px", lineHeight: 1.65, color: "var(--cr-ink-2)" }}>
                {startup.founders!.map((f) => [f.name, f.role].filter(Boolean).join(" — ")).join("\n")}
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
