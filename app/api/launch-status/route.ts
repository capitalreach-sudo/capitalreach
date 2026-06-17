import { NextResponse } from "next/server";
import { getLaunchStatus } from "@/lib/launchMode";

export const revalidate = 60;

export async function GET() {
  const status = await getLaunchStatus();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
