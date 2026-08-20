import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resolveEntity } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * "I'm interested" — the lightest possible signal between two profiles.
 *
 * A deal proposal carries an amount and obligations; a watchlist save is
 * private. This is the middle register: one click that the OTHER side gets
 * to hear about. Founders signal interest in investors, investors in
 * startups — always cross-type, enforced by a table CHECK.
 *
 * The owner of a profile sees a count, never a roster: who is interested is
 * the sender's information to reveal (by opening a deal), not ours.
 *
 * GET    ?targetType=&targetId= → { interested, count }  (count: owner only)
 * POST   { targetType, targetId } — signal
 * DELETE ?targetType=&targetId= — withdraw
 */
type TargetType = "startup" | "investor";

// Startups carry `status`, investors carry `is_public` — normalise both to
// the two facts this route needs: who owns it, and is it visible.
async function ctx(targetType: TargetType, targetId: string) {
  const admin = createAdminClient();
  if (targetType === "startup") {
    const { data } = await admin.from("startups")
      .select("id, owner_id, status").eq("id", targetId).maybeSingle();
    return { admin, target: data ? { owner_id: data.owner_id, live: data.status === "active" } : null };
  }
  const { data } = await admin.from("investors")
    .select("id, owner_id, is_public").eq("id", targetId).maybeSingle();
  return { admin, target: data ? { owner_id: data.owner_id, live: data.is_public } : null };
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const targetType = req.nextUrl.searchParams.get("targetType") as TargetType;
  const targetId = req.nextUrl.searchParams.get("targetId") ?? "";
  if (!["startup", "investor"].includes(targetType) || !isUuid(targetId)) {
    return NextResponse.json({ error: "Bad target" }, { status: 400 });
  }
  const { admin, target } = await ctx(targetType, targetId);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mine = await resolveEntity(user.id, targetType === "startup" ? "investor" : "startup");
  const [{ data: mySignal }, ownerCount] = await Promise.all([
    mine
      ? admin.from("interest_signals").select("id")
          .match({ from_id: mine.entityId, target_type: targetType, target_id: targetId }).maybeSingle()
      : Promise.resolve({ data: null }),
    target.owner_id === user.id
      ? admin.from("interest_signals")
          .select("id", { count: "exact", head: true })
          .match({ target_type: targetType, target_id: targetId })
      : Promise.resolve({ count: null }),
  ]);
  return NextResponse.json({ interested: !!mySignal, count: ownerCount.count });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { targetType, targetId } = await req.json().catch(() => ({}));
  if (!["startup", "investor"].includes(targetType) || !isUuid(targetId ?? "")) {
    return NextResponse.json({ error: "Bad target" }, { status: 400 });
  }
  const { admin, target } = await ctx(targetType, targetId);
  if (!target || !target.live) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.owner_id === user.id) return NextResponse.json({ error: "That is your own profile" }, { status: 400 });

  const fromType = targetType === "startup" ? "investor" : "startup";
  const mine = await resolveEntity(user.id, fromType);
  if (!mine) {
    return NextResponse.json({ error: fromType === "investor" ? "Investors only" : "Founders only" }, { status: 403 });
  }

  const { error } = await admin.from("interest_signals").insert({
    from_user: user.id, from_type: fromType, from_id: mine.entityId,
    target_type: targetType, target_id: targetId,
  });
  // Unique violation = already interested; that is a success, not an error —
  // and crucially it must NOT re-notify, or the button becomes a ping cannon.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Could not record interest" }, { status: 500 });
  }
  if (!error && target.owner_id) {
    const fromTable = fromType === "startup" ? "startups" : "investors";
    const { data: me } = await admin.from(fromTable)
      .select(fromType === "startup" ? "name" : "display_name, firm_name").eq("id", mine.entityId).maybeSingle();
    const rec = (me ?? {}) as Record<string, string | null>;
    const name = rec.name ?? rec.display_name ?? rec.firm_name ?? (fromType === "startup" ? "A startup" : "An investor");
    await notifyUser({
      userId: target.owner_id,
      type: "interest",
      title: `${name} is interested`,
      body: fromType === "investor"
        ? "An investor signalled interest in your round. Open a deal to start the conversation."
        : "A startup signalled interest in working with you.",
      href: fromType === "investor" ? "/dashboard/startup" : "/dashboard/investor",
    }).catch(() => {});
  }
  return NextResponse.json({ interested: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const targetType = req.nextUrl.searchParams.get("targetType") as TargetType;
  const targetId = req.nextUrl.searchParams.get("targetId") ?? "";
  if (!["startup", "investor"].includes(targetType) || !isUuid(targetId)) {
    return NextResponse.json({ error: "Bad target" }, { status: 400 });
  }
  // Withdrawal goes through the user's OWN session: RLS's from_user policy is
  // the authority on whose signal this is.
  await supabase.from("interest_signals").delete()
    .match({ target_type: targetType, target_id: targetId });
  return NextResponse.json({ interested: false });
}
