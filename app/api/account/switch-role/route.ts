import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";

/**
 * Switch a signed-in account between founder and investor.
 *
 * Signup used to skip the role question whenever the link carried ?role=, and
 * the homepage's main button carries role=startup, so investors registered as
 * founders without ever choosing and then met a "set up your startup" wall with
 * no way out. This is the way out.
 *
 * Only for an account that has not built anything yet: owning a startup or an
 * investor profile, or holding a team seat, refuses the switch, because the
 * role would then disagree with the entity every dashboard and gate resolves
 * from. role is server-only on profiles (reject_client_column_write), so the
 * write goes through the service role, and the auth metadata follows it so
 * the callback and onboarding read the same answer.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const role = body?.role;
  if (role !== "startup" && role !== "investor") {
    return NextResponse.json({ error: "role must be startup or investor" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.role === "admin") return NextResponse.json({ error: "Admin accounts cannot switch type" }, { status: 403 });
  if (profile.role === role) return NextResponse.json({ ok: true, role });

  const [{ count: startups }, { count: investors }, { count: seats }] = await Promise.all([
    admin.from("startups").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    admin.from("investors").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    admin.from("team_members").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  if ((startups ?? 0) > 0 || (investors ?? 0) > 0 || (seats ?? 0) > 0) {
    return NextResponse.json({ error: "has_profile", messageKey: "roleSwitch.hasProfile" }, { status: 409 });
  }

  const limited = await dbRateLimit(user.id, "switch_role", ...(Object.values(RATE.perDay(5)) as [number, number]));
  if (!limited.ok) return NextResponse.json({ error: "Too many switches today" }, { status: 429 });

  const { error } = await admin.from("profiles").update({ role }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Could not switch" }, { status: 500 });
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...(user.user_metadata ?? {}), role },
  }).catch(() => {});

  return NextResponse.json({ ok: true, role });
}
