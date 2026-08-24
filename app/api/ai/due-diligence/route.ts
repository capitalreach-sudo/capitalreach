import { NextRequest, NextResponse } from "next/server";
import { protectFounders } from "@/lib/identity";
import { extractDocuments } from "@/lib/doc-text";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { checkAiAllowance, logAiUsage } from "@/lib/ai-limits";
import { generateDueDiligenceReport, webScreenCompany, isOpenAIConfigured } from "@/lib/openai";
import { aiRatelimit } from "@/lib/redis";
import { getLaunchStatus } from "@/lib/launchMode";
import { buildAccessContext, canAiDueDiligence } from "@/lib/access";

export async function POST(req: NextRequest) {
  if (!isOpenAIConfigured) {
    return NextResponse.json(
      { error: "AI features are not configured. Add OPENAI_API_KEY to your environment." },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Daily allowance (migration 042): counts in the database, so it holds
    // even where the Upstash limiter is unconfigured. Tier read is cheap and
    // the profile is fetched by every one of these routes anyway.
    {
      const { data: prof } = await supabase.from("profiles").select("subscription_tier").eq("id", user.id).maybeSingle();
      const allowance = await checkAiAllowance(user.id, "due-diligence", prof?.subscription_tier);
      if (!allowance.ok) {
        return allowance.limit === 0
          ? NextResponse.json({ error: "AI tools are a paid feature. Upgrade your plan to use them.", upgrade: true }, { status: 402 })
          : NextResponse.json({ error: `Daily limit of ${allowance.limit} reached. Upgrade for more.` }, { status: 429 });
      }
      await logAiUsage(user.id, "due-diligence");
    }

  try {
    const { success } = await aiRatelimit.limit(user.id);
    if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  } catch {
    // Redis unavailable — fail open and allow the request through
  }

  const { startupId, questions: rawQuestions } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(startupId))) return NextResponse.json({ error: "Invalid startup" }, { status: 400 });
  // C29: up to five custom questions, answered in their own section.
  const questions: string[] = Array.isArray(rawQuestions)
    ? rawQuestions.filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 3).map((q) => q.trim().slice(0, 300)).slice(0, 5)
    : [];

  const [profileRes, startupRes, { isLaunch }] = await Promise.all([
    supabase.from("profiles").select("id, role, subscription_tier, suspended, account_status").eq("id", user.id).single(),
    supabase
      .from("startups")
      .select("*, founders:startup_founders(*), documents:startup_documents(*)")
      .eq("id", startupId)
      .single(),
    getLaunchStatus(),
  ]);

  const profile = profileRes.data;
  const startup = startupRes.data;
  if (!startup) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  // No diligence on a listing that isn't publicly visible.
  if (startup.status !== "active") {
    return NextResponse.json({ error: "Startup not available" }, { status: 404 });
  }

  const ctx = buildAccessContext(profile, isLaunch);
  if (!canAiDueDiligence(ctx)) {
    return NextResponse.json(
      { error: "Upgrade to Pro Investor for AI due diligence reports." },
      { status: 403 }
    );
  }

  const { data: investor } = await supabase
    .from("investors")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  // Identity protection (Phase 1): the report names founders in full only
  // when this investor already has a live deal on the startup — the same rule
  // as the listing page. Otherwise the model sees "Sarah K." and no links,
  // so the report cannot become a lookup tool for going around the platform.
  let reveal = profile?.role === "admin";
  if (!reveal && investor?.id) {
    const { data: deal } = await supabase
      .from("deals").select("id, status")
      .match({ startup_id: startupId, investor_id: investor.id })
      .neq("status", "passed")
      .limit(1).maybeSingle();
    reveal = !!deal;
  }

  // C29: the documents this investor is actually entitled to open. NDA-gated
  // files stay shut unless they signed — the model gets exactly what the
  // human would get, never more.
  let documents: Awaited<ReturnType<typeof extractDocuments>>["extracted"] = [];
  let skippedDocs: string[] = [];
  {
    const all = (startup.documents ?? []) as Array<{ id: string; label: string; type: string; file_url: string; requires_nda: boolean }>;
    let ndaSigned = false;
    if (investor?.id && startup.require_nda) {
      const { data: nda } = await supabase.from("nda_records").select("signed_at").match({ startup_id: startupId, investor_id: investor.id }).maybeSingle();
      ndaSigned = !!nda?.signed_at;
    }
    const allowed = all.filter((d) => {
      const locked = d.requires_nda || startup.require_nda;
      return !locked || ndaSigned || profile?.role === "admin";
    });
    if (allowed.length) {
      const res = await extractDocuments(allowed);
      documents = res.extracted;
      skippedDocs = res.skipped;
    }
  }

  // The web screen runs in PARALLEL with the report body — same wall time.
  const webScreenPromise = webScreenCompany({
    name: startup.name,
    country: startup.country,
    website: (startup as { website?: string | null }).website ?? null,
    founders: (startup.founders ?? []) as Array<{ name: string }>,
  });

  const report = await generateDueDiligenceReport({
    name: startup.name,
    tagline: startup.tagline,
    industry: startup.industry,
    stage: startup.stage,
    country: startup.country,
    problem: startup.problem ?? "",
    solution: startup.solution ?? "",
    market: startup.market ?? "",
    competitive_advantage: startup.competitive_advantage ?? "",
    mrr: startup.mrr,
    arr: startup.arr,
    user_count: startup.user_count,
    growth_rate: startup.growth_rate,
    funding_target: startup.funding_target,
    equity_offered: startup.equity_offered,
    founders: protectFounders(startup.founders, reveal),
    documents,
    questions,
  });

  // Append the web screen — sourced findings or an honest "unavailable".
  const webScreen = await webScreenPromise;
  const fullReport = report + "\n\nWEB SCREENING\n" + (
    webScreen ?? "Web screening was unavailable for this report — findings above are based only on the company's own materials."
  );

  const adminClient = createAdminClient();
  await adminClient.from("ai_reports").insert({
    investor_id: investor?.id,
    startup_id: startupId,
    type: "due_diligence",
    content: fullReport,
  });

  // Tell the caller what the model could and couldn't read — a report that
  // silently skipped the financial model must not look complete.
  return NextResponse.json({
    report: fullReport,
    documentsRead: documents.map((d) => d.label),
    documentsSkipped: skippedDocs,
  });
}
