import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "6"), 20);

  if (q.length < 2) {
    return NextResponse.json({ startups: [] });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("startups")
    .select("id, slug, name, industry, stage")
    .ilike("name", `%${q}%`)
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ startups: data ?? [] });
}
