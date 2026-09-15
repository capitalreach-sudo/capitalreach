import { NextRequest, NextResponse } from "next/server";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { buildAccessContext, investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";
import { notifyUser } from "@/lib/notify-user";
import { isAccountSuspended } from "@/lib/suspension-guard";

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

// investor_id, target_investor_id -- the mirror of watchlists_own for the
// investor-watching-investor path (migration 139). A bookmark only: no
// notification, no thread, nothing the watched investor can see. That is
// deliberate, not an oversight -- see the migration's note on scope. Kept
// separate from the startupId path below because the two kinds have
// genuinely different rules (plan cap + founder ping vs. neither here), not
// because the columns forced it.
async function saveInvestorWatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  targetInvestorId: string,
) {
  const investorId = await resolveInvestorId(supabase, userId);
  if (!investorId) {
    return NextResponse.json(
      { error: "Complete your investor profile before saving investors." },
      { status: 403 }
    );
  }
  if (investorId === targetInvestorId) {
    return NextResponse.json({ error: "You can't watch yourself" }, { status: 400 });
  }
  const { error } = await supabase
    .from("watchlists")
    .upsert(
      { investor_id: investorId, target_investor_id: targetInvestorId, changes_seen_at: new Date().toISOString() },
      { onConflict: "investor_id,target_investor_id" },
    );
  if (error) {
    console.error("investor watchlist upsert failed:", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

async function removeInvestorWatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  targetInvestorId: string,
) {
  const investorId = await resolveInvestorId(supabase, userId);
  if (!investorId) return NextResponse.json({ saved: false });
  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("investor_id", investorId)
    .eq("target_investor_id", targetInvestorId);
  if (error) {
    console.error("investor watchlist delete failed:", error);
    return NextResponse.json({ error: "Could not remove" }, { status: 500 });
  }
  return NextResponse.json({ saved: false });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { startupId?: string; note?: string | null; targetInvestorId?: string };

  // Two kinds of save share this route (migration 139): a startup, or --
  // new -- a fellow investor. targetInvestorId, when present, is the whole
  // request; it never carries a note or the startup cap below.
  if (isUuid(body.targetInvestorId)) {
    return saveInvestorWatch(supabase, user.id, body.targetInvestorId as string);
  }

  const { startupId, note } = body;
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId or targetInvestorId required" }, { status: 400 });

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
    // changes_seen_at from the first moment: the column has no default, and a
    // NULL is read as epoch by /api/watchlist/changes -- so a fresh save
    // presented the startup's entire pre-save history as "what changed since
    // you last looked" (exactly the failure migration 088's backfill names).
    { investor_id: investorId, startup_id: startupId, changes_seen_at: new Date().toISOString() };
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
      // Re-notify guard: unsave→re-save would re-ping the founder. Cap the
      // notify per (investor, listing) per day; the save itself is unaffected.
      const canPing = st?.owner_id && (await dbRateLimit(user.id, `save_ping:${startupId}`, ...Object.values(RATE.perDay(1)) as [number, number])).ok;
      if (st?.owner_id && st.owner_id !== user.id && canPing) {
        await notifyUser({
          userId: st.owner_id,
          type: "listing_saved",
          title: "An investor saved your listing",
          body: "Open your dashboard to see how many investors have saved you.",
          titleKey: "notif.savedTitle", bodyKey: "notif.savedBody",
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

  const body = (await req.json().catch(() => ({}))) as { startupId?: string; targetInvestorId?: string };
  if (isUuid(body.targetInvestorId)) {
    return removeInvestorWatch(supabase, user.id, body.targetInvestorId as string);
  }

  const { startupId } = body;
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId or targetInvestorId required" }, { status: 400 });

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

/**
 * PATCH { startupId, status?, priority?, note? } — C26: the watchlist as a
 * pipeline. Status (watching / reviewing / contacted / passed) and priority
 * (0–3) on an existing save. Investor's own row only (RLS).
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }
  const { startupId, status, priority, note } = (await req.json().catch(() => ({}))) as { startupId?: string; status?: string; priority?: number; note?: string | null };
  if (!isUuid(startupId ?? "")) return NextResponse.json({ error: "startupId required" }, { status: 400 });
  const investorId = await resolveInvestorId(supabase, user.id);
  if (!investorId) return NextResponse.json({ error: "Complete your investor profile first." }, { status: 403 });
  const patch: { status?: string; priority?: number; note?: string | null; updated_at: string } = { updated_at: new Date().toISOString() };
  if (status !== undefined) {
    if (!["watching", "reviewing", "contacted", "passed"].includes(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    patch.status = status;
  }
  if (priority !== undefined) {
    if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 0 || priority > 3) return NextResponse.json({ error: "priority must be 0–3" }, { status: 400 });
    patch.priority = priority;
  }
  if (note !== undefined) patch.note = typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : null;
  const { data, error } = await supabase.from("watchlists").update(patch).match({ investor_id: investorId, startup_id: startupId }).select("id, status, priority, note").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not on your watchlist" }, { status: 404 });
  return NextResponse.json({ saved: true, item: data });
}
