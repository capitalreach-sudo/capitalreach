import OpenAI from "openai";

const _apiKey = process.env.OPENAI_API_KEY ?? "";

/** True only when a real (non-placeholder) OpenAI key is configured. */
export const isOpenAIConfigured =
  _apiKey.length >= 40 &&
  _apiKey.startsWith("sk-") &&
  !_apiKey.includes("REPLACE") &&
  !_apiKey.includes("placeholder") &&
  !_apiKey.includes("not-configured");

if (!isOpenAIConfigured) {
  console.warn("[OpenAI] OPENAI_API_KEY is not configured — AI features will return 503.");
}

export const openai = new OpenAI({
  // SDK is instantiated even if key is placeholder; routes must guard with isOpenAIConfigured.
  apiKey: _apiKey || "sk-not-configured",
});

export async function generatePitchFeedback(pitchData: {
  problem: string;
  solution: string;
  market: string;
  competitive_advantage: string;
  use_of_funds: string;
  funding_target: number;
  stage: string;
  industry: string;
}): Promise<{
  clarity: string;
  market_sizing: string;
  competitive_positioning: string;
  missing_information: string;
  overall_score: number;
  summary: string;
}> {
  const prompt = `You are an expert startup pitch analyst. Analyze this startup pitch and provide structured feedback.

Industry: ${pitchData.industry}
Stage: ${pitchData.stage}
Funding Target: $${pitchData.funding_target.toLocaleString()}

PROBLEM: ${pitchData.problem}
SOLUTION: ${pitchData.solution}
TARGET MARKET: ${pitchData.market}
COMPETITIVE ADVANTAGE: ${pitchData.competitive_advantage}
USE OF FUNDS: ${pitchData.use_of_funds}

Return a JSON object with these exact keys:
- clarity (string, 2-3 sentences on how clear and compelling the narrative is)
- market_sizing (string, 2-3 sentences assessing market opportunity and TAM/SAM/SOM)
- competitive_positioning (string, 2-3 sentences on defensibility and moat)
- missing_information (string, bullet list of what's missing or needs strengthening)
- overall_score (number 0-100)
- summary (string, 1 paragraph executive summary of the pitch quality)`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  return JSON.parse(response.choices[0].message.content!);
}

export async function generateDueDiligenceReport(startup: {
  name: string;
  tagline: string;
  industry: string;
  stage: string;
  country: string;
  problem: string;
  solution: string;
  market: string;
  competitive_advantage: string;
  mrr?: number | null;
  arr?: number | null;
  user_count?: number | null;
  growth_rate?: number | null;
  funding_target: number;
  equity_offered?: number | null;
  founders?: Array<{ name: string; role: string }>;
}): Promise<string> {
  const prompt = `You are a senior venture capital analyst. Write a structured 500-word investment due diligence report for the following startup.

Company: ${startup.name}
Tagline: ${startup.tagline}
Industry: ${startup.industry}
Stage: ${startup.stage}
Country: ${startup.country}
Funding Ask: $${startup.funding_target.toLocaleString()}${startup.equity_offered ? ` for ${startup.equity_offered}% equity` : ""}

PROBLEM: ${startup.problem || "Not provided"}
SOLUTION: ${startup.solution || "Not provided"}
MARKET: ${startup.market || "Not provided"}
COMPETITIVE ADVANTAGE: ${startup.competitive_advantage || "Not provided"}

TRACTION:
- MRR: ${startup.mrr ? "$" + startup.mrr.toLocaleString() : "Not disclosed"}
- ARR: ${startup.arr ? "$" + startup.arr.toLocaleString() : "Not disclosed"}
- Users: ${startup.user_count?.toLocaleString() || "Not disclosed"}
- MoM Growth: ${startup.growth_rate ? startup.growth_rate + "%" : "Not disclosed"}

TEAM: ${startup.founders?.map(f => `${f.name} (${f.role})`).join(", ") || "Not provided"}

Structure your report with these sections:
1. Executive Summary (2-3 sentences)
2. Market Opportunity (evaluate size, timing, and tailwinds)
3. Team Assessment (evaluate experience and completeness)
4. Traction & Business Model (evaluate metrics and unit economics)
5. Competitive Landscape (identify key risks and moat strength)
6. Key Risks (top 3 risks an investor should consider)
7. Comparable Companies (2-3 relevant comps with outcomes)
8. Investment Verdict (Buy/Pass/Watch with clear rationale)

Write professionally and objectively. Be specific and data-driven where possible.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
    max_tokens: 1000,
  });

  return response.choices[0].message.content!;
}

export async function scoreStartup(startup: {
  name: string;
  problem: string | null;
  solution: string | null;
  market: string | null;
  competitive_advantage: string | null;
  mrr: number | null;
  arr: number | null;
  user_count: number | null;
  growth_rate: number | null;
  founders: Array<{ name: string; role: string; linkedin_url: string | null }>;
  documents: Array<{ type: string }>;
  milestones: Array<{ description: string }>;
  stage: string;
}): Promise<number> {
  const completenessScore = [
    startup.problem,
    startup.solution,
    startup.market,
    startup.competitive_advantage,
    startup.mrr !== null,
    startup.arr !== null,
    startup.user_count !== null,
    startup.founders.length > 0,
    startup.founders.some(f => f.linkedin_url),
    startup.documents.some(d => d.type === "pitch_deck"),
    startup.milestones.length > 0,
  ].filter(Boolean).length;

  const prompt = `Score this startup 0-100 on investment quality. Return only a JSON object with key "score" (integer).

Completeness: ${completenessScore}/11 sections filled
Stage: ${startup.stage}
MRR: ${startup.mrr ? "$" + startup.mrr : "None"}
Growth Rate: ${startup.growth_rate ? startup.growth_rate + "% MoM" : "Unknown"}
Team Size: ${startup.founders.length} founders
Has pitch deck: ${startup.documents.some(d => d.type === "pitch_deck") ? "Yes" : "No"}
Milestones: ${startup.milestones.length}

Scoring criteria:
- 0-30: Very early, minimal info
- 31-50: Early stage, some traction
- 51-70: Good fundamentals, decent traction
- 71-85: Strong team + traction
- 86-100: Exceptional across all dimensions`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content!);
  return Math.min(100, Math.max(0, result.score));
}

export async function matchStartupsToInvestor(
  investorPrefs: {
    industries: string[];
    stages: string[];
    min_check: number | null;
    max_check: number | null;
    geography: string[];
  },
  startups: Array<{
    id: string;
    name: string;
    industry: string;
    stage: string;
    country: string;
    funding_target: number;
    mrr: number | null;
    tagline: string;
  }>
): Promise<string[]> {
  const prompt = `You are a startup-investor matching algorithm. Return a JSON object with key "matches" containing an array of startup IDs (strings) that best match this investor, sorted by fit score descending. Return at most 10 IDs.

INVESTOR PREFERENCES:
Industries: ${investorPrefs.industries.join(", ") || "Any"}
Stages: ${investorPrefs.stages.join(", ") || "Any"}
Check Size: ${investorPrefs.min_check ? "$" + investorPrefs.min_check.toLocaleString() : "No min"} - ${investorPrefs.max_check ? "$" + investorPrefs.max_check.toLocaleString() : "No max"}
Geography: ${investorPrefs.geography.join(", ") || "Global"}

STARTUPS:
${startups.map(s => `ID: ${s.id} | ${s.name} | ${s.industry} | ${s.stage} | ${s.country} | Raise: $${s.funding_target.toLocaleString()} | MRR: ${s.mrr ? "$" + s.mrr : "N/A"} | "${s.tagline}"`).join("\n")}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const result = JSON.parse(response.choices[0].message.content!);
  return result.matches || [];
}
