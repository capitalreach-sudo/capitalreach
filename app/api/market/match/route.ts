import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase-server";

/**
 * The public matcher behind the homepage's "who's waiting for you" widget:
 * how many live investors declare appetite for a given stage and sector.
 * AGGREGATE COUNTS ONLY -- the same information the public directory's
 * filters already expose, never a name. Preferences are cached for five
 * minutes; a homepage toy must not cost a table scan per hover.
 */
const loadPrefs = unstable_cache(async () => {
  const admin = createAdminClient();
  // PostgREST clamps any single response to its max-rows (1000 here), so the
  // whole market is paged in explicitly. 25 pages = 25k investors of headroom.
  const out: Array<{ industries: string[]; stages: string[] }> = [];
  for (let page = 0; page < 25; page++) {
    const { data } = await admin
      .from("investors")
      .select("industries, stages")
      .eq("is_public", true)
      .eq("is_external", false)
      .range(page * 1000, page * 1000 + 999);
    const rows = data ?? [];
    for (const r of rows) out.push({ industries: r.industries ?? [], stages: r.stages ?? [] });
    if (rows.length < 1000) break;
  }
  return out;
}, ["market-match-prefs"], { revalidate: 300 });

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const stage = (sp.get("stage") ?? "").slice(0, 40);
  const industry = (sp.get("industry") ?? "").slice(0, 60);

  const prefs = await loadPrefs();
  const count = prefs.filter((p) => {
    const stgOk = !stage || p.stages.length === 0 || p.stages.includes(stage);
    const indOk = !industry || p.industries.length === 0 || p.industries.includes(industry);
    return stgOk && indOk;
  }).length;

  return NextResponse.json({ count, total: prefs.length });
}
