import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getLaunchStatus } from "@/lib/launchMode";

// The old `revalidate = 60` export never cached anything: getLaunchStatus
// reads through createAdminClient, whose fetch wrapper pins `no-store`, which
// opts the whole route out of the data cache - verified live (consecutive
// requests both answered x-vercel-cache MISS). unstable_cache actually holds
// the result for 60s, the same pattern the homepage stats use, so the
// launch-banner poll on every page load stops firing a DB query each time.
// Freshness contract is unchanged: the banner tolerates a minute of lag.
const cachedLaunchStatus = unstable_cache(
  () => getLaunchStatus(),
  ["launch-status"],
  { revalidate: 60 }
);

export async function GET() {
  // No route-level Cache-Control: vercel.json forces `no-store` on every
  // /api/(.*), and the two collided into a mangled bare `Cache-Control: public`
  // (no max-age) on the live response. Let vercel.json own the header; the
  // 60s hold lives server-side in unstable_cache above.
  const status = await cachedLaunchStatus();
  return NextResponse.json(status);
}
