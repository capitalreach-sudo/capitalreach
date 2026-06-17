import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { isOpenAIConfigured } from "@/lib/openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "sk-not-configured" });

// In-memory rate limiter: 5 analyses per IP per hour
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
        { error: "AI features are not yet configured. Add your OPENAI_API_KEY to the environment variables." },
        { status: 503 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit reached (5/hour). Try again soon." },
        { status: 429 }
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

    // Validate and clamp scores
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
      strengths: Array.isArray(result.strengths)
        ? result.strengths.slice(0, 3)
        : [],
      improvements: Array.isArray(result.improvements)
        ? result.improvements.slice(0, 3)
        : [],
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
