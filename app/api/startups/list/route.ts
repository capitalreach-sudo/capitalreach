import { NextRequest, NextResponse } from "next/server";
import { loadActiveStartups, stripBrowseFinancials, viewerCanSeeFinancials } from "@/lib/browse-data";

// Same query as the server-rendered /startups page (lib/browse-data), so a
// client refresh can never disagree with the initial HTML.
//
// Dynamic, not revalidated: the response now depends on WHO is asking. MRR/ARR
// are gated to the financials tier, so they are stripped for anyone who has not
// unlocked them. A shared 60-second cache would have served one viewer's
// entitled payload (with the figures) to the next anonymous caller, which is
// the exact leak this closes.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const offset = Number(sp.get("offset")) || 0;
  const q = sp.get("q") ?? undefined;
  const result = await loadActiveStartups({ offset, q, limit: q ? 100 : 1000 });
  if (result === null) {
    return NextResponse.json({ error: "Could not load listings" }, { status: 500 });
  }
  const canSeeFinancials = await viewerCanSeeFinancials();
  return NextResponse.json({
    startups: stripBrowseFinancials(result.rows, canSeeFinancials),
    total: result.total,
    offset,
  });
}
