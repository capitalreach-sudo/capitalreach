import { NextResponse } from "next/server";
import { computePlatformData, EMPTY_PLATFORM_DATA } from "@/lib/platform-data";

// The aggregate lives in lib/platform-data so the server-rendered /data page
// and this JSON endpoint compute identical numbers. Revalidated each minute.
export const revalidate = 60;

const CACHE = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" };

export async function GET() {
  const data = await computePlatformData();
  // Never 500: a public dashboard that errors reads as "the platform is
  // down". Zeros plus a `degraded` flag let the client show a retry instead.
  if (!data) {
    return NextResponse.json({ ...EMPTY_PLATFORM_DATA, degraded: true }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(data, { headers: CACHE });
}
