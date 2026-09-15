import { NextResponse } from "next/server";
import { computePlatformData, EMPTY_PLATFORM_DATA } from "@/lib/platform-data";
import { viewerMayNameStartups } from "@/lib/data-centre-access";

// The aggregate lives in lib/platform-data so the server-rendered /data page
// and this JSON endpoint compute identical numbers.
//
// Dynamic and never shared-cached, because the answer now depends on WHO is
// asking: /data blanks the two NAMED lists for a viewer who may not read
// listings, and the Data Centre polls this route every 60 seconds and on every
// visibilitychange. A public s-maxage copy of the named payload handed those
// names straight back to the viewer the page had just withheld them from.
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const data = await computePlatformData();
  // Never 500: a public dashboard that errors reads as "the platform is
  // down". Zeros plus a `degraded` flag let the client show a retry instead.
  if (!data) {
    return NextResponse.json({ ...EMPTY_PLATFORM_DATA, degraded: true }, { headers: { "Cache-Control": "no-store" } });
  }
  // Shared with app/data/page.tsx -- see lib/data-centre-access.ts. Safe by
  // default: any failure resolves to "may not name", which costs a
  // signed-in member two ledgers and costs a stranger nothing.
  const mayName = await viewerMayNameStartups();
  return NextResponse.json(
    mayName ? data : { ...data, topStartups: [], recentStartups: [] },
    { headers: CACHE },
  );
}
