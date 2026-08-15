import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { buildAccessContext, canUseSavedSearches } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";

/**
 * Saved searches for investors.
 *
 * canUseSavedSearches() has been a plan capability since the tier system was
 * built and is listed on the pricing page; until migration 021 there was no
 * table behind it. GET lists, POST creates or renames-in-place, DELETE removes.
 */

async function resolveInvestor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  // saved_searches.investor_id references investors(id), not profiles(id) --
  // the distinction that made the watchlist route silently fail for months.
  const [{ data: investor }, { data: profile }] = await Promise.all([
    supabase.from("investors").select("id, subscription_tier").eq("owner_id", userId).maybeSingle(),
    supabase.from("profiles").select("id, role, subscription_tier, suspended, account_status").eq("id", userId).maybeSingle(),
  ]);
  return { investor, profile };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investor } = await resolveInvestor(supabase, user.id);
  if (!investor) return NextResponse.json({ searches: [] });

  const { data } = await supabase
    .from("saved_searches")
    .select("id, name, filters, created_at")
    .eq("investor_id", investor.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ searches: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const { investor, profile } = await resolveInvestor(supabase, user.id);
  if (!investor) {
    return NextResponse.json({ error: "Complete your investor profile first." }, { status: 403 });
  }
  // Guarding this lets the `as any` below go away, and closes the gap it hid:
  // spreading a null profile produces a truthy object, which skips
  // buildAccessContext's own null branch and yields suspended: false. Every
  // signed-up user has a profile row, so this is belt-and-braces -- but the
  // cast was what made it invisible.
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 403 });
  }

  // The investor's own tier governs, matching how the rest of the app reads
  // investor capabilities.
  const { isLaunch } = await getLaunchStatus();
  const ctx = buildAccessContext({ ...profile, subscription_tier: investor.subscription_tier }, isLaunch);
  if (!canUseSavedSearches(ctx)) {
    return NextResponse.json({ error: "Saved searches are not available on your plan.", upgrade: true }, { status: 403 });
  }

  const { name, filters } = await req.json().catch(() => ({}));
  const trimmed = typeof name === "string" ? name.trim().slice(0, 80) : "";
  if (!trimmed) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (filters == null || typeof filters !== "object" || Array.isArray(filters)) {
    return NextResponse.json({ error: "Filters must be an object" }, { status: 400 });
  }

  // Upsert on (investor_id, name): saving twice under the same name updates it
  // rather than leaving two entries the investor has to tell apart by eye.
  const { data, error } = await supabase
    .from("saved_searches")
    .upsert(
      { investor_id: investor.id, name: trimmed, filters },
      { onConflict: "investor_id,name" }
    )
    .select("id, name, filters, created_at")
    .single();

  if (error) {
    console.error("[saved-searches]", error);
    return NextResponse.json({ error: "Could not save that search" }, { status: 500 });
  }

  return NextResponse.json({ search: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { investor } = await resolveInvestor(supabase, user.id);
  if (!investor) return NextResponse.json({ deleted: false });

  // Scoped by investor_id as well as id: RLS already enforces this, but a
  // delete that relies solely on the policy is one policy edit away from being
  // a cross-tenant delete.
  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", id)
    .eq("investor_id", investor.id);

  if (error) return NextResponse.json({ error: "Could not save search" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
