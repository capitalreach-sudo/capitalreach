import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILE_PROSE_FIELDS, maskProse } from "@/lib/message-safety";
import { slugify } from "@/lib/utils";

/**
 * The investor's own profile, saved.
 *
 * The listing's problem in the other direction: a bio and a thesis are read
 * by every founder who opens the profile, so an address in either one is a
 * standing invitation to talk off the platform before any offer exists. Same
 * rule, same reason it cannot be done in the browser -- see
 * app/api/startups/save.
 *
 * The caller's session does the write so the owner-only RLS policy stays the
 * authorization.
 */

// Set by admin, billing or the trust layer, never by the profile form.
// contact_email and contact_note belong to externally-added investors and are
// written by the founder who added them, not here.
const NOT_FROM_THE_FORM = new Set([
  "id", "owner_id", "slug", "subscription_tier", "created_at",
  "trust_level", "trust_expires_at", "trust_reviewed_at",
  "verified_at", "verified_by", "verification_checks",
  "is_demo", "is_external", "is_public", "managed_by_startup_id",
  "contact_email", "contact_note", "search_vector",
]);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fields, create } = await req.json().catch(() => ({}));
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return NextResponse.json({ error: "fields required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (!NOT_FROM_THE_FORM.has(key)) patch[key] = value;
  }

  // One profile per account, oldest first -- the plan buttons in onboarding
  // call this on every press and each one used to insert a twin.
  const { data: existing } = await supabase
    .from("investors")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!existing && !create) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const safe = await maskProse({
    fields: patch,
    proseFields: PROFILE_PROSE_FIELDS,
    surface: "profile_prose",
    subjectType: existing ? "investor" : "profile",
    subjectId: existing?.id ?? user.id,
  });
  const withheld = safe.masked.length
    ? { contactsWithheld: safe.masked, maskedFields: safe.changed }
    : {};

  if (existing) {
    const { error } = await supabase
      .from("investors")
      .update(safe.fields as never)
      .eq("id", existing.id);
    // 23514 is the prose contact-detail trigger (123), and its message names
    // the field and the remedy. It should not fire on this path -- maskProse
    // ran above -- but it will the moment masking is switched off in config,
    // and "Could not save" would leave a founder with no idea why.
    if (error?.code === "23514") {
      return NextResponse.json({ error: error.message, code: "contact_in_prose" }, { status: 400 });
    }
    if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
    return NextResponse.json({ id: existing.id, ...withheld });
  }

  const base = slugify(
    (typeof patch.display_name === "string" && patch.display_name) ||
    (typeof patch.firm_name === "string" && patch.firm_name) ||
    "investor",
  );
  const { data: created, error } = await supabase
    .from("investors")
    .insert({
      owner_id: user.id,
      slug: `${base}-${Math.random().toString(36).slice(2, 6)}`,
      subscription_tier: "free",
      ...safe.fields,
    } as never)
    .select("id")
    .single();
  if (error || !created) {
    return NextResponse.json({ error: error?.message || "Could not create" }, { status: 400 });
  }
  return NextResponse.json({ id: (created as { id: string }).id, created: true, ...withheld });
}
