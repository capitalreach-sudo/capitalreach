import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { isOpenAIConfigured } from "@/lib/openai";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { aiRatelimit } from "@/lib/redis";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "sk-not-configured" });

export async function POST(req: NextRequest) {
  try {
    // Same exposure as analyze-pitch: no session required and rate limited
    // only by IP, while every call bills a GPT-4o completion to us. An
    // IP-keyed bucket is a speed bump, not a spend control.
    const authed = await createServerSupabaseClient();
    const { data: { user } } = await authed.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to use AI tools." }, { status: 401 });
    }
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: "Verify your email address to use AI tools." },
        { status: 403 }
      );
    }
    if (await isAccountSuspended(user.id)) {
      return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const [byUser, byIp] = await Promise.all([
      aiRatelimit.limit(`user:${user.id}`),
      aiRatelimit.limit(`ip:${ip}`),
    ]);
    if (!byUser.success || !byIp.success) {
      return NextResponse.json({ error: "Rate limit reached. Try again in an hour." }, { status: 429 });
    }

    // Auth precedes this deliberately -- an anonymous caller should learn
    // nothing about how this deployment is configured. The old copy also
    // instructed the *visitor* to set an environment variable, which is a
    // message for whoever deployed the app.
    if (!isOpenAIConfigured) {
      return NextResponse.json(
        { error: "AI matching is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    const { industry, stage, mrr, description } = await req.json();

    const supabase = createAdminClient();
    const { data: investors } = await supabase
      .from("investors")
      .select(`
        id, slug, type, bio, industries, stages, min_check, max_check, geography,
        profiles:owner_id ( full_name )
      `)
      .not("stages", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);

    if (!investors || investors.length === 0) {
      return NextResponse.json({ matches: [], message: "No investors in the database yet." });
    }

    const investorList = investors.map((inv: any) => ({
      id: inv.id,
      slug: inv.slug,
      type: inv.type || "angel",
      name: inv.profiles?.full_name || "Investor",
      industries: inv.industries || [],
      stages: inv.stages || [],
      minCheck: inv.min_check ?? null,
      maxCheck: inv.max_check ?? null,
      geography: inv.geography || [],
      bio: (inv.bio || "").slice(0, 120),
    }));

    const prompt = `You are a venture capital analyst matching startups to investors.

Startup profile:
- Industry: ${industry || "Not specified"}
- Stage: ${stage || "Not specified"}
- MRR: ${mrr || "Not specified"}
- Description: ${(description || "Not provided").slice(0, 400)}

Below is the COMPLETE list of real investors on the platform. You MUST only return IDs from this list — do not invent investors.

Investor list:
${JSON.stringify(investorList, null, 0)}

Return a JSON object with this structure:
{
  "matches": [
    {
      "investorId": "<exact id from the list>",
      "matchScore": <integer 60-99>,
      "matchReason": "<one sentence explaining the fit based on their industries, stages, and check size>"
    }
  ]
}

Rules:
- Select the top 4-6 best matches only
- Only include investor IDs from the provided list above — never invent IDs
- Sort by matchScore descending
- Return valid JSON only`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 600,
    });

    const result = JSON.parse(response.choices[0].message.content!);
    const rawMatches: Array<{ investorId: string; matchScore: number; matchReason: string }> =
      Array.isArray(result.matches) ? result.matches : [];

    const investorMap = new Map(investorList.map((inv: any) => [inv.id, inv]));
    const validatedMatches = rawMatches
      .filter(m => investorMap.has(m.investorId))
      .slice(0, 6)
      .map(m => {
        const inv = investorMap.get(m.investorId) as any;
        return {
          id: inv.id,
          slug: inv.slug,
          name: inv.name,
          type: inv.type,
          industries: inv.industries,
          stages: inv.stages,
          minCheck: inv.minCheck,
          maxCheck: inv.maxCheck,
          geography: inv.geography,
          matchScore: m.matchScore,
          matchReason: m.matchReason,
          initials: inv.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase(),
        };
      });

    return NextResponse.json({ matches: validatedMatches });
  } catch (err) {
    console.error("[smart-match]", err);
    return NextResponse.json({ error: "Matching failed. Please try again." }, { status: 500 });
  }
}
