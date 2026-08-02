import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { isOpenAIConfigured } from "@/lib/openai";
import { aiRatelimit } from "@/lib/redis";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "sk-not-configured" });

export async function POST(req: NextRequest) {
  try {
    // This route was reachable by anyone: no session required, rate limited
    // only by IP. Every call bills a GPT-4o completion to our account, and IPs
    // are cheap enough that an IP-keyed bucket is not a spend control -- it is
    // a speed bump. A signed-in identity is the thing that can actually be
    // held to a quota.
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
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

    // Keyed by user now, not IP -- a quota someone cannot escape by changing
    // network. The IP bucket stays as a second ceiling on top.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const [byUser, byIp] = await Promise.all([
      aiRatelimit.limit(`user:${user.id}`),
      aiRatelimit.limit(`ip:${ip}`),
    ]);
    if (!byUser.success || !byIp.success) {
      return NextResponse.json(
        { error: "Rate limit reached. Try again in an hour." },
        { status: 429 }
      );
    }

    // Config is checked after auth deliberately: an anonymous caller should
    // learn nothing about how this deployment is configured, and a 401 is the
    // honest answer to them regardless of whether the key is set.
    if (!isOpenAIConfigured) {
      return NextResponse.json(
        { error: "AI analysis is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    const body = await req.json();
    const pitch_text: string = body.pitch_text ?? "";

    if (pitch_text.trim().length < 30) {
      return NextResponse.json(
        { error: "Pitch too short — write at least 30 characters." },
        { status: 400 }
      );
    }

    const prompt = `You are a world-class startup pitch analyst and VC with 20+ years evaluating thousands of pitches at firms like Sequoia, a16z, and YC. Analyze this startup pitch with honest, expert, specific feedback.

PITCH:
${pitch_text.slice(0, 3500)}

Return ONLY valid JSON with these EXACT keys — no commentary outside the JSON:
{
  "overall_score": <integer 0-100, be genuinely critical — most pitches are 45-75>,
  "clarity_score": <integer 0-100, how clear and compelling is the narrative?>,
  "market_score": <integer 0-100, how strong is the market opportunity and sizing?>,
  "moat_score": <integer 0-100, how defensible is the competitive position?>,
  "team_score": <integer 0-100, infer from pitch — if not mentioned, score low>,
  "traction_score": <integer 0-100, infer from any metrics, customers, revenue mentioned>,
  "verdict": <exactly one of: "Exceptional" | "Strong" | "Promising" | "Needs Work" | "Significant Gaps">,
  "strengths": <array of EXACTLY 3 strings — be specific to THIS pitch, not generic>,
  "improvements": <array of EXACTLY 3 strings — be actionable and specific>,
  "key_insight": <string, 1-2 sentences — the single most important thing an investor would take away, specific to this pitch>
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 800,
    });

    const result = JSON.parse(response.choices[0].message.content!);

    const clamp = (v: unknown) =>
      Math.min(100, Math.max(0, Math.round(Number(v) || 50)));

    return NextResponse.json({
      overall_score: clamp(result.overall_score),
      clarity_score: clamp(result.clarity_score),
      market_score: clamp(result.market_score),
      moat_score: clamp(result.moat_score),
      team_score: clamp(result.team_score),
      traction_score: clamp(result.traction_score),
      verdict: String(result.verdict || "Promising"),
      strengths: Array.isArray(result.strengths) ? result.strengths.slice(0, 3) : [],
      improvements: Array.isArray(result.improvements) ? result.improvements.slice(0, 3) : [],
      key_insight: String(result.key_insight || ""),
    });
  } catch (err) {
    console.error("[analyze-pitch]", err);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
