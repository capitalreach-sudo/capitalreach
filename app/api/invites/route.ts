import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isUuid } from "@/lib/utils";
import { brand } from "@/lib/brand";

/**
 * F: invite links.
 *
 * A link rather than an email send, on purpose. The platform has no mail
 * domain yet, and an invite that silently fails to send is worse than no
 * invite at all. The inviter copies the link and sends it through the
 * relationship that makes the invite worth anything — which is also why the
 * note is for them to remember who it was for, not for us to read.
 *
 * GET    — my invites
 * POST   { role, note } — mint one
 * DELETE ?id= — revoke an unused one
 */

const MAX_OPEN_INVITES = 25;

/**
 * Unambiguous alphabet: no 0/O, no 1/I/l. These get read aloud and retyped
 * from a phone screen, and a code that can be mistyped is a dead link with
 * no explanation.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function mintCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("invites")
    .select("id, code, invite_role, note, accepted_at, accepted_by, revoked_at, created_at")
    .eq("inviter_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // Who accepted, by name — the point of inviting somebody is finding out
  // whether they came.
  const acceptedIds = (data ?? []).map(i => i.accepted_by).filter((id): id is string => !!id);
  const accepted = acceptedIds.length
    ? (await admin.from("profiles").select("id, full_name, role").in("id", acceptedIds)).data ?? []
    : [];

  return NextResponse.json({
    baseUrl: brand.url,
    invites: (data ?? []).map(i => ({
      ...i,
      url: `${brand.url}/auth/signup?invite=${i.code}`,
      acceptedName: accepted.find(a => a.id === i.accepted_by)?.full_name ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const { role, note } = await req.json().catch(() => ({}));
  if (role !== "startup" && role !== "investor") {
    return NextResponse.json({ error: "role must be startup or investor" }, { status: 400 });
  }
  const text = typeof note === "string" && note.trim() ? note.trim().slice(0, 120) : null;

  const admin = createAdminClient();

  // A cap on OPEN invites rather than on total: someone whose invites keep
  // being accepted is doing the thing we want, and should not run out.
  const { count } = await admin
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("inviter_id", user.id)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if ((count ?? 0) >= MAX_OPEN_INVITES) {
    return NextResponse.json({ error: `You have ${MAX_OPEN_INVITES} unused invites already. Revoke one first.` }, { status: 409 });
  }

  // Collision is astronomically unlikely at 10 chars from a 31-letter
  // alphabet, but the unique index is the authority, so retry rather than
  // hand the user a 500 they cannot act on.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = mintCode();
    const { data, error } = await admin
      .from("invites")
      .insert({ inviter_id: user.id, code, invite_role: role, note: text })
      .select("id, code, invite_role, note, created_at")
      .single();
    if (!error && data) {
      return NextResponse.json({ invite: { ...data, url: `${brand.url}/auth/signup?invite=${data.code}` } });
    }
    if ((error as { code?: string } | null)?.code !== "23505") break;
  }
  return NextResponse.json({ error: "Could not create an invite" }, { status: 500 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: invite } = await admin.from("invites").select("id, inviter_id, accepted_at").eq("id", id).maybeSingle();
  if (!invite || invite.inviter_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // An accepted invite is a record of somebody joining. Revoking it would
  // rewrite that, and it does nothing useful — the link is already spent.
  if (invite.accepted_at) return NextResponse.json({ error: "That invite was already used." }, { status: 409 });

  const { error } = await admin.from("invites").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not revoke it" }, { status: 500 });
  return NextResponse.json({ success: true });
}
