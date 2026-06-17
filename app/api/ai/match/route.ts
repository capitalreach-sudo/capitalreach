import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { matchStartupsToInvestor, isOpenAIConfigured } from "@/lib/openai";

export async function GET(req: NextRequest) {
  if (!isOpenAIConfigured) {
    return NextResponse.json(
      { error: "AI matching requires an OpenAI API key." },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: investor } = await supabase
    .from("investors")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (!investor) return NextResponse.json({ error: "Investor not found" }, { status: 404 });

  // Get active startups not already in watchlist
  const { data: watchlist } = await supabase
    .from("watchlists")
    .select("startup_id")
    .eq("investor_id", investor.id);

  const savedIds = (watchlist || []).map(w => w.startup_id);

  let q = supabase
    .from("startups")
    .select("id, name, tagline, industry, stage, country, funding_target, mrr")
    .eq("status", "active")
    .limit(50);

  if (savedIds.length > 0) {
    q = q.not("id", "in", `(${savedIds.join(",")})`);
  }

  const { data: startups } = await q;
  if (!startups || startups.length === 0) return NextResponse.json({ matches: [] });

  const matchedIds = await matchStartupsToInvestor(
    {
      industries: investor.industries,
      stages: investor.stages,
      min_check: investor.min_check,
      max_check: investor.max_check,
      geography: investor.geography,
    },
    startups
  );

  const matches = matchedIds
    .map(id => startups.find(s => s.id === id))
    .filter(Boolean);

  return NextResponse.json({ matches });
}
