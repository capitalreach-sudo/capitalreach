import { NextResponse } from "next/server";
import { getLaunchStatus } from "@/lib/launchMode";

export const revalidate = 60;

export async function GET() {
  // No route-level Cache-Control: vercel.json forces `no-store` on every
  // /api/(.*), and the two collided into a mangled bare `Cache-Control: public`
  // (no max-age) on the live response. Let vercel.json own the header so it is
  // clean; `revalidate = 60` still serves this from the Next data cache, so the
  // launch-banner poll does not re-run the query on every request.
  const status = await getLaunchStatus();
  return NextResponse.json(status);
}
