import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * Who you may start a conversation with.
 *
 * This search used to run in the browser, straight against `profiles`, and
 * matched on EMAIL. It worked because profiles was readable by every signed-in
 * user — which also meant any account could page the whole table and harvest
 * every member's address. On a platform whose entire model is that identity
 * costs a deal and a 2% fee, that was the model's back door.
 *
 * So: the search moved server-side, it matches on names and entity names only,
 * and it never returns an email. What comes back is what the directory already
 * shows publicly, narrowed to accounts you are allowed to write to.
 */

export interface AccountResult {
  id: string;                    // profile id of the recipient
  full_name: string | null;
  role: string;
  avatar_url: string | null;
  entity_name?: string;
  entity_slug?: string;
  entity_type?: string;
  kind: "investor" | "startup";
}

const LIMIT = 10;
// PostgREST `or` filters are a comma-separated mini-language; a stray comma or
// paren in the query would change its meaning, not just its terms.
const clean = (q: string) => q.replace(/[,()*\\%]/g, " ").trim().slice(0, 60);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = clean(req.nextUrl.searchParams.get("q") ?? "");
  const kind = req.nextUrl.searchParams.get("kind") === "startup" ? "startup" : "investor";

  if (kind === "startup") {
    // Listings only, never the raw profile table: a founder is reachable
    // because they have a listing, not because they have an account.
    let query = admin
      .from("startups")
      .select("owner_id, name, slug")
      .in("status", ["active", "pending_review"])
      .neq("owner_id", user.id)
      .limit(LIMIT);
    if (q) query = query.ilike("name", `%${q}%`);
    const { data: startups } = await query;

    const ownerIds = (startups ?? []).map(s => s.owner_id).filter(Boolean);
    const owners = ownerIds.length
      ? (await admin.from("profiles").select("id, full_name, role, avatar_url").in("id", ownerIds)).data ?? []
      : [];

    const results: AccountResult[] = (startups ?? []).map(s => {
      const owner = owners.find(o => o.id === s.owner_id);
      return {
        id: s.owner_id,
        full_name: owner?.full_name ?? null,
        role: owner?.role ?? "startup",
        avatar_url: owner?.avatar_url ?? null,
        entity_name: s.name,
        entity_slug: s.slug,
        kind: "startup" as const,
      };
    });
    return NextResponse.json({ results });
  }

  // Investors: only those who chose to be listed, and never an off-platform
  // contact somebody's founder typed into their own pipeline.
  let query = admin
    .from("investors")
    .select("owner_id, slug, type, display_name, firm_name")
    .eq("is_public", true)
    .eq("is_external", false)
    .not("owner_id", "is", null)
    .neq("owner_id", user.id)
    .limit(LIMIT);
  if (q) query = query.or(`display_name.ilike.%${q}%,firm_name.ilike.%${q}%`);
  const { data: investors } = await query;

  const ownerIds = (investors ?? []).map(i => i.owner_id).filter((id): id is string => !!id);
  const owners = ownerIds.length
    ? (await admin.from("profiles").select("id, full_name, role, avatar_url").in("id", ownerIds)).data ?? []
    : [];

  const results: AccountResult[] = (investors ?? []).map(i => {
    const owner = owners.find(o => o.id === i.owner_id);
    return {
      id: i.owner_id as string,
      full_name: owner?.full_name ?? null,
      role: owner?.role ?? "investor",
      avatar_url: owner?.avatar_url ?? null,
      entity_name: i.firm_name || i.display_name || owner?.full_name || undefined,
      entity_slug: i.slug,
      entity_type: i.type,
      kind: "investor" as const,
    };
  });
  return NextResponse.json({ results });
}
