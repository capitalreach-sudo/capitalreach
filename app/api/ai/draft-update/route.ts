import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { openai, isOpenAIConfigured } from "@/lib/openai";
import { checkAiAccess } from "@/lib/ai-access";
import { checkAiAllowance, logAiUsage } from "@/lib/ai-limits";
import { aiRatelimit } from "@/lib/redis";
import { resolveEntity } from "@/lib/membership";

/**
 * Draft an investor update from the startup's own recent numbers.
 *
 * The model gets ONLY what the founder already publishes — current metrics,
 * the last few months of history, recent milestones — and is told to write
 * the update a good founder writes: numbers first, one honest sentence about
 * what's hard, one ask. It returns a DRAFT into the composer; nothing is
 * posted until the founder edits and presses publish themselves.
 */
export async function POST() {
  if (!isOpenAIConfigured) {
    return NextResponse.json({ error: "AI drafting is not configured.", unavailable: true }, { status: 503 });
  }
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ai = await checkAiAccess(user.id);
  if (!ai.allowed) {
    return NextResponse.json({ error: "AI tools are a paid feature. Upgrade your plan to use them.", upgrade: true }, { status: 402 });
  }
  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const { success } = await aiRatelimit.limit(`draft-update:${user.id}`);
  if (!success) return NextResponse.json({ error: "Too many drafts just now — try again in a minute." }, { status: 429 });

  const admin = createAdminClient();
  const { data: st } = await admin.from("startups")
    .select("name, mrr, arr, user_count, paying_customers, growth_rate, runway_months, funding_target, subscription_tier")
    .eq("id", mine.entityId).maybeSingle();
  if (!st) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowance = await checkAiAllowance(user.id, "draft-update", st.subscription_tier);
  if (!allowance.ok) {
    return allowance.limit === 0
      ? NextResponse.json({ error: "AI tools are a paid feature. Upgrade your plan to use them.", upgrade: true }, { status: 402 })
      : NextResponse.json({ error: `Daily limit of ${allowance.limit} reached. Upgrade for more.` }, { status: 429 });
  }

  const [{ data: metrics }, { data: milestones }] = await Promise.all([
    admin.from("startup_metrics").select("month, mrr, user_count")
      .eq("startup_id", mine.entityId).order("month", { ascending: false }).limit(4),
    admin.from("startup_milestones").select("date, description")
      .eq("startup_id", mine.entityId).order("date", { ascending: false }).limit(5),
  ]);

  const facts = [
    `Company: ${st.name}`,
    st.mrr != null ? `MRR: $${st.mrr}` : null,
    st.growth_rate != null ? `MoM growth: ${st.growth_rate}%` : null,
    st.user_count != null ? `Users: ${st.user_count}` : null,
    st.paying_customers != null ? `Paying customers: ${st.paying_customers}` : null,
    st.runway_months != null ? `Runway: ${st.runway_months} months` : null,
    (metrics ?? []).length ? `Recent months (newest first): ${(metrics ?? []).map(m => `${m.month}: MRR $${m.mrr ?? "?"}`).join("; ")}` : null,
    (milestones ?? []).length ? `Recent milestones: ${(milestones ?? []).map(m => `${m.date}: ${m.description}`).join("; ")}` : null,
  ].filter(Boolean).join("\n");

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      messages: [
        { role: "system", content: "You draft investor updates for startup founders. Write in first person plural, plain prose, no markdown headings. Structure: 2-3 sentences of progress with the actual numbers; one honest sentence about the hardest thing right now (infer a plausible generic one ONLY if nothing suggests it — never invent specific events); one concrete ask of investors. Under 160 words. Use only the facts given — never invent numbers." },
        { role: "user", content: facts },
      ],
    });
    const draft = res.choices[0]?.message?.content?.trim() ?? "";
    if (!draft) return NextResponse.json({ error: "Drafting failed" }, { status: 502 });
    await logAiUsage(user.id, "draft-update");
    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json({ error: "The drafting model is unavailable right now." }, { status: 502 });
  }
}
