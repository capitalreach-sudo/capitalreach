import { NextResponse } from "next/server";
import { brand } from "@/lib/brand";

/**
 * /demo used to 302 to the STAGING deployment -- which renders
 * pixel-identical to prod with no sandbox banner, no demo credentials, an
 * anonymous market gate that demonstrates nothing, and a live signup form
 * writing real accounts into the staging database. Until an actual guided
 * sandbox exists, the honest public showcase is the Data Centre: live
 * numbers, real charts, no impersonation risk. Kept as a route so old links
 * keep resolving.
 */
export function GET() {
  return NextResponse.redirect(new URL("/data", brand.url), 302);
}
