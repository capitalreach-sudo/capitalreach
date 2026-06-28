import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("startups")
    .select("id,slug,name,tagline,industry,stage,funding_target,mrr,arr,growth_rate,runway_months,featured,created_at,vaultrise_score,country,business_model")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ startups: data ?? [] });
}
