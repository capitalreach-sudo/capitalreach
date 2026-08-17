import { NextResponse } from "next/server";
import { loadActiveStartups } from "@/lib/browse-data";

// Same query as the server-rendered /startups page (lib/browse-data), so a
// client refresh can never disagree with the initial HTML. Revalidated every
// minute so a suspended or newly approved listing shows up promptly.
export const revalidate = 60;

export async function GET() {
  const startups = await loadActiveStartups();
  if (startups === null) {
    return NextResponse.json({ error: "Could not load listings" }, { status: 500 });
  }
  return NextResponse.json({ startups });
}
