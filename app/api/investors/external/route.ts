import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { isUuid, slugify } from "@/lib/utils";

/**
 * B18: off-platform investors. The angel who will never make an account is
 * still part of the round, so the founder can add them as a contact the
 * pipeline understands — an investors row with no owner, owned (in the
 * management sense) by the founder's startup and readable by nobody else
 * (RLS, migration 072).
 *
 * Because it is a real investors row, every existing feature — deals,
 * commitments, the raise tracker, checklists, activity — works on them
 * unchanged. What does not work is anything that needs an account:
 * messaging, notifications and NDA envelopes all skip them by design.
 *
 * POST   { name, email?, firm?, note?, openDeal?, amount?, currency? }
 * GET    → this startup's own external contacts
 * PATCH  { id, name?, email?, firm?, note? }
 * DELETE { id }
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim().slice(0, 254) : null;
  const firm = typeof body.firm === "string" && body.firm.trim() ? body.firm.trim().slice(0, 120) : null;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null;

  const admin = createAdminClient();
  // Slugs are unique across the table; external ones are never linked to, so
  // a random suffix is enough and avoids leaking the contact's name.
  const slug = `ext-${slugify(name).slice(0, 24) || "contact"}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: inv, error } = await admin
    .from("investors")
    .insert({
      slug, display_name: name, firm_name: firm, type: "angel",
      is_external: true, owner_id: null, managed_by_startup_id: mine.entityId,
      is_public: false, contact_email: email, contact_note: note,
    })
    .select("id, slug, display_name, firm_name, contact_email, contact_note")
    .single();
  if (error || !inv) {
    console.error("[external investor]", error);
    return NextResponse.json({ error: "Could not add the contact" }, { status: 500 });
  }

  // Optionally open the deal in the same action — that is the point of
  // adding them: they belong on the board and in the raise total.
  let deal = null;
  if (body.openDeal) {
    const amount = typeof body.amount === "number" && body.amount > 0 && body.amount < 1e12 ? Math.round(body.amount) : null;
    const { data: d } = await admin
      .from("deals")
      .insert({
        startup_id: mine.entityId, investor_id: inv.id, status: "intro",
        amount, currency: typeof body.currency === "string" ? body.currency.slice(0, 3).toUpperCase() : "USD",
        commitment_type: "interest", stage_entered_at: new Date().toISOString(),
      })
      .select()
      .single();
    deal = d ?? null;
    if (deal) {
      await admin.from("deal_activity").insert({
        deal_id: deal.id, startup_id: mine.entityId, investor_id: inv.id, actor_id: user.id,
        type: "note", body: `Added as an off-platform contact${firm ? ` · ${firm}` : ""}`,
      }).then(undefined, () => {});
    }
  }
  return NextResponse.json({ investor: inv, deal });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ contacts: [] });
  const admin = createAdminClient();
  const { data } = await admin
    .from("investors")
    .select("id, display_name, firm_name, contact_email, contact_note, created_at")
    .eq("managed_by_startup_id", mine.entityId)
    .eq("is_external", true)
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ contacts: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const { id, name, email, firm, note } = await req.json().catch(() => ({}));
  if (!isUuid(id ?? "")) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: { display_name?: string; contact_email?: string | null; firm_name?: string | null; contact_note?: string | null } = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.display_name = name.trim().slice(0, 120);
  }
  if (email !== undefined) patch.contact_email = typeof email === "string" && email.trim() ? email.trim().slice(0, 254) : null;
  if (firm !== undefined) patch.firm_name = typeof firm === "string" && firm.trim() ? firm.trim().slice(0, 120) : null;
  if (note !== undefined) patch.contact_note = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("investors").update(patch)
    .match({ id, is_external: true, managed_by_startup_id: mine.entityId })
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ updated: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });
  const { id } = await req.json().catch(() => ({}));
  if (!isUuid(id ?? "")) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  // A closed deal is a record of something that happened — removing the
  // contact would erase it, so that is refused rather than cascaded.
  const { data: closed } = await admin.from("deals").select("id").eq("investor_id", id).eq("status", "closed").limit(1).maybeSingle();
  if (closed) return NextResponse.json({ error: "This contact has a closed deal and can't be removed." }, { status: 409 });

  const { error } = await admin.from("investors").delete().match({ id, is_external: true, managed_by_startup_id: mine.entityId });
  if (error) return NextResponse.json({ error: "Could not remove" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
