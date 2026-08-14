import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { TERMS_VERSION } from "@/lib/terms-version";

/**
 * Record that the signed-in user accepted the current Terms (migration 051).
 *
 * Called by the signup flow right after the account exists. The version and
 * ip come from the server, never the client: an acceptance record the
 * client composes is a record the client can dispute. Append-only —
 * accepting twice records twice, which is harmless and honest.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

  const admin = createAdminClient();
  const { error } = await admin.from("terms_acceptances").insert({
    user_id: user.id,
    version: TERMS_VERSION,
    ip,
  });
  if (error) return NextResponse.json({ error: "Could not record" }, { status: 500 });
  return NextResponse.json({ ok: true, version: TERMS_VERSION });
}
