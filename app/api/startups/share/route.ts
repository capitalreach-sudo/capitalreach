import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { founderGate } from "@/lib/plan-gate";
import { isUuid } from "@/lib/utils";
import { brand } from "@/lib/brand";

/**
 * Share links for a founder's own round.
 *
 * The listing page is already public — the pitch, the problem, the ask. The
 * thing a founder cannot share is the DECK: every recipient has to make an
 * account first, and the founder never finds out whether anyone opened it.
 *
 * A link is a token the founder mints, labels for their own memory, optionally
 * grants document access through, and can revoke. Deck access is OFF by
 * default: sharing a deck with the internet is a decision, not a default.
 *
 * GET    — my links
 * POST   { label, grantsDocuments, expiresInDays } — mint one
 * DELETE ?id= — revoke one
 */

const MAX_ACTIVE = 20;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function mintToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
}

async function ownStartup(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin.from("startups").select("id, slug, name").eq("owner_id", userId).maybeSingle();
  return data;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const startup = await ownStartup(admin, user.id);
  if (!startup) return NextResponse.json({ links: [] });

  const { data } = await admin
    .from("round_shares")
    .select("id, token, label, grants_documents, expires_at, revoked_at, opens, last_opened_at, created_at")
    .eq("startup_id", startup.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    links: (data ?? []).map(l => ({ ...l, url: `${brand.url}/r/${l.token}` })),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const { label, grantsDocuments, expiresInDays } = await req.json().catch(() => ({}));
  const note = typeof label === "string" && label.trim() ? label.trim().slice(0, 120) : null;
  const days = Number(expiresInDays);
  const expires = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + Math.min(days, 365) * 86_400_000).toISOString()
    : null;

  const admin = createAdminClient();
  const startup = await ownStartup(admin, user.id);
  if (!startup) return NextResponse.json({ error: "Create your listing first." }, { status: 403 });

  // Granting document access through a link is the data-room feature by
  // another door, so it carries the same plan gate. Sharing the page itself is
  // free on every plan.
  let grants = grantsDocuments === true;
  if (grants) {
    const caps = await founderGate(user.id);
    if (!caps.dataRoom) grants = false;
  }

  const { count } = await admin
    .from("round_shares").select("id", { count: "exact", head: true })
    .eq("startup_id", startup.id).is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE) {
    return NextResponse.json({ error: `You have ${MAX_ACTIVE} live links already. Revoke one first.` }, { status: 409 });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const token = mintToken();
    const { data, error } = await admin
      .from("round_shares")
      .insert({ startup_id: startup.id, token, label: note, grants_documents: grants, expires_at: expires })
      .select("id, token, label, grants_documents, expires_at, opens, created_at")
      .single();
    if (!error && data) {
      return NextResponse.json({
        link: { ...data, url: `${brand.url}/r/${data.token}` },
        // Say when the request asked for something the plan does not include,
        // rather than quietly handing back a weaker link than was asked for.
        documentsWithheld: grantsDocuments === true && !grants,
      });
    }
    if ((error as { code?: string } | null)?.code !== "23505") break;
  }
  return NextResponse.json({ error: "Could not create a link" }, { status: 500 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const startup = await ownStartup(admin, user.id);
  if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: link } = await admin.from("round_shares").select("id, startup_id").eq("id", id).maybeSingle();
  if (!link || link.startup_id !== startup.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Revoked, not deleted: the open count is a record of who looked, and
  // deleting the row would erase it along with the access.
  const { error } = await admin.from("round_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not revoke it" }, { status: 500 });
  return NextResponse.json({ success: true });
}
