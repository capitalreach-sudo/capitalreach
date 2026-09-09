import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { browseIndexPublic } from "@/lib/listing-visibility";

/**
 * The catalogue gate, for the routes BEHIND the pages.
 *
 * /startups and /investors redirect an anonymous visitor to sign in, but the
 * APIs those pages call answered the same visitor in full -- so the whole
 * catalogue, and the investor directory, were one fetch away from anyone who
 * opened devtools. Gating a page without gating its data source is a lock on
 * a door with the wall missing.
 *
 * Returns a 401 Response when the caller must be refused, or null to proceed.
 */
export async function requireCatalogueAccess(): Promise<NextResponse | null> {
  // Open catalogue: nothing to enforce.
  if (await browseIndexPublic()) return null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return null;
  } catch {
    // Consistent with the rest of the visibility layer: a failed session read
    // must not black out the catalogue for the members who can see it.
    return null;
  }
  return NextResponse.json(
    { error: "authentication_required", verifyUrl: "/auth/login" },
    { status: 401 },
  );
}
