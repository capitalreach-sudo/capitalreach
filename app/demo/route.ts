import { NextResponse } from "next/server";

/**
 * The demo walk-in: the staging environment carries a fully seeded market
 * (20k accounts, 10k listings, 500 deals) and is safe to wander -- nothing
 * in it is real. A route rather than a raw link so the destination can
 * change without touching every CTA that points here.
 */
export function GET() {
  return NextResponse.redirect("https://capitalreach-staging.vercel.app/?demo=1", 302);
}
