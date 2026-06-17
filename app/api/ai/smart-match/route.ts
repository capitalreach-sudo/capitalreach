import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { isOpenAIConfigured } from "@/lib/openai";
import { createAdminClient } from "@/lib/supabase-server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "sk-not-configured" });

const rateLimitMap = new Map<string, { count: number; reset: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    if (!isOpenAIConfigured) {
      return NextResponse.json(
        { error: "AI matching requires an OpenAI API key. Set OPENAI_API_KEY in your environment." },
        { status: 503 }
      );
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Rate limit reached. Try again soon." }, { status: 429 });
    }

    const { industry, stage, mrr, description } = await req.json();

    // Fetch real investors from the DB
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

    // Build a compact list for GPT (no PII beyond what's public)
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

    // Validate: only return matches whose IDs actually exist in our list
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
          // Initials for avatar
          initials: inv.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase(),
        };
      });

    return NextResponse.json({ matches: validatedMatches });
  } catch (err) {
    console.error("[smart-match]", err);
    return NextResponse.json({ error: "Matching failed. Please try again." }, { status: 500 });
  }
}
