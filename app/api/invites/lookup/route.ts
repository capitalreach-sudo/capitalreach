import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

/**
 * What an invite code is for, before signing up.
 *
 * Returns the role it opens and the inviter's name — nothing else. The
 * inviter's note is deliberately not returned: it is their reminder of who
 * the link was for ("Marta, the angel from the Berlin dinner"), not a message
 * to the recipient, and it should not be readable by whoever ends up with the
 * link.
 *
 * Unknown, spent and revoked codes all answer the same way. Distinguishing
 * them would confirm to a stranger that a code exists.
 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase().slice(0, 32);
  if (!code) return NextResponse.json({ valid: false });

  const admin = createAdminClient();
  const { data } = await admin
    .from("invites")
    .select("invite_role, accepted_at, revoked_at, inviter_id")
    .eq("code", code)
    .maybeSingle();

  if (!data || data.accepted_at || data.revoked_at) return NextResponse.json({ valid: false });

  const { data: inviter } = await admin
    .from("profiles").select("full_name").eq("id", data.inviter_id).maybeSingle();

  return NextResponse.json({
    valid: true,
    role: data.invite_role,
    inviterName: inviter?.full_name ?? null,
  });
}
