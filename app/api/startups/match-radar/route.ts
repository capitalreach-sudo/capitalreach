import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * The match radar: how many live investors fit this founder's round, and the
 * shape of that demand -- counted honestly from the preferences investors
 * actually published (industry and stage; an empty preference list means
 * "anything"). Counts and breakdowns for every plan; identities stay where
 * they always were, behind the directory and its gates. Nothing here names
 * anyone, so there is nothing here to leak.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: startup } = await admin
    .from("startups")
    .select("id, industry, stage")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!startup) return NextResponse.json({ count: 0, byType: {}, total: 0 });

  const { data: investors } = await admin
    .from("investors")
    .select("type, industries, stages")
    .eq("is_public", true)
    .eq("is_external", false)
    .limit(2000);

  const all = investors ?? [];
  const matches = all.filter((inv) => {
    const indOk = !inv.industries?.length || (startup.industry && inv.industries.includes(startup.industry));
    const stgOk = !inv.stages?.length || (startup.stage && inv.stages.includes(startup.stage));
    return indOk && stgOk;
  });

  const byType: Record<string, number> = {};
  for (const m of matches) {
    const k = m.type || "angel";
    byType[k] = (byType[k] ?? 0) + 1;
  }

  return NextResponse.json({ count: matches.length, byType, total: all.length });
}
