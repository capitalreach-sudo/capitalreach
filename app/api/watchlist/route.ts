import { NextRequest, NextResponse } from "next/server";
import { buildAccessContext, investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";
import { notifyUser } from "@/lib/notify-user";

// watchlists.investor_id references investors(id), NOT profiles(id).
//
// Both handlers previously passed user.id — a profiles id — which no investor
// row can ever match, so the watchlists_own RLS policy rejected every insert
// and every delete matched zero rows. Saving a startup has never worked through
// this route. Resolve the caller's investors row first.
async function resolveInvestorId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("investors")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId, note } = await req.json() as { startupId: string; note?: string | null };
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const investorId = await resolveInvestorId(supabase, user.id);
  if (!investorId) {
    return NextResponse.json(
      { error: "Complete your investor profile before saving startups." },
      { status: 403 }
    );
  }

  // A saved startup with no reason attached stops being a shortlist and becomes
  // a pile. `note` is optional, and only written when the caller sends the key
  // -- so re-saving without a note doesn't wipe one already there.
  const row: import("@/types/supabase").Database["public"]["Tables"]["watchlists"]["Insert"] =
    { investor_id: investorId, startup_id: startupId };
  if (note !== undefined) {
    row.note = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null;
  }

  // Was this pair already saved? Only a genuinely new save should notify the
  // founder -- re-saving to edit a note must stay silent.
  const { data: prior } = await supabase
    .from("watchlists")
    .select("investor_id")
    .eq("investor_id", investorId)
    .eq("startup_id", startupId)
    .maybeSingle();

  // Enforce the plan's watchlist cap on genuinely new saves (editing a note on
  // an existing save is always allowed).
  if (!prior) {
    const { data: prof } = await supabase
      .from("profiles").select("id, role, subscription_tier, suspended, account_status").eq("id", user.id).maybeSingle();
    const { isLaunch } = await getLaunchStatus();
    const cap = investorCan(buildAccessContext(prof, isLaunch)).watchlistLimit;
    if (Number.isFinite(cap)) {
      const { count } = await supabase
        .from("watchlists").select("*", { count: "exact", head: true }).eq("investor_id", investorId);
      if ((count ?? 0) >= cap) {
        return NextResponse.json(
          { error: `Free plan saves up to ${cap} startups. Upgrade for unlimited.` },
          { status: 403 }
        );
      }
    }
  }

  const { error } = await supabase
    .from("watchlists")
    .upsert(row, { onConflict: "investor_id,startup_id" });

  // Raw Postgres messages leak schema details; log them, return a plain error.
  if (error) {
    console.error("watchlist upsert failed:", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  // Tell the founder someone saved their listing -- but never who. The name is
  // what the Who-saved-you panel sells; the notification just says interest
  // exists and links to that panel. Awaited (never detached on serverless) and
  // best-effort: notifyUser swallows its own errors, and a failure here must
  // not fail the save. Resolve the founder's user id via the service role,
  // since watchlists RLS can't read the startup's owner.
  if (!prior) {
    try {
      const admin = createAdminClient();
      const { data: st } = await admin
        .from("startups")
        .select("owner_id")
        .eq("id", startupId)
        .maybeSingle();
      if (st?.owner_id && st.owner_id !== user.id) {
        await notifyUser({
          userId: st.owner_id,
          type: "listing_saved",
          title: "An investor saved your listing",
          body: "Open your dashboard to see how many investors have saved you.",
          href: "/dashboard/startup",
        });
      }
    } catch (e) {
      console.error("listing_saved notify failed:", e);
    }
  }

  return NextResponse.json({ saved: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId } = await req.json() as { startupId: string };
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const investorId = await resolveInvestorId(supabase, user.id);
  if (!investorId) return NextResponse.json({ saved: false });

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("investor_id", investorId)
    .eq("startup_id", startupId);

  if (error) {
    console.error("watchlist delete failed:", error);
    return NextResponse.json({ error: "Could not remove" }, { status: 500 });
  }

  return NextResponse.json({ saved: false });
}
