import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LISTING_PROSE_FIELDS, maskProse } from "@/lib/message-safety";
import { slugify } from "@/lib/utils";

/**
 * The founder's own listing, saved.
 *
 * It exists because of one column: description. A message, a question and an
 * answer are all masked on write, but the listing itself was not, and an
 * address typed into the pitch is read by every investor who opens the page.
 * That made offer-before-contact optional at no effort at all. Masking has to
 * happen on the way IN -- a page cannot be un-published -- and a browser
 * cannot be asked to redact itself, so the write moved here.
 *
 * The write still runs through the CALLER'S session rather than the service
 * role, deliberately: the owner-only RLS policy and the founder tier caps
 * from 109 (NDA gating, demo video, the listing limit) are triggers on
 * auth.uid() writes, and the service role is exempt from both. Using the
 * admin client here would quietly switch all of that off.
 */

// Columns the form has no business naming. Approval, tier, trust and the
// score are decided elsewhere; the rest identify the row or record its
// history. Everything else the founder already owns.
const NOT_FROM_THE_FORM = new Set([
  "id", "owner_id", "slug", "status", "subscription_tier", "created_at", "updated_at",
  "trust_level", "trust_expires_at", "trust_reviewed_at",
  "verified_at", "verified_by", "verification_checks",
  "vaultrise_score", "scored_at", "pageviews", "featured", "is_demo",
  "listed_at", "edited_since_review_at", "round_state", "round_state_changed_at",
  "search_vector", "draft_nudged_at", "draft_nudge_count",
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

  // ONE listing per founder, oldest first -- the same row the onboarding flow
  // reuses when checkout bounces somebody back into it. A plain insert there
  // once gave a single account five pending listings.
  const { data: existing } = await supabase
    .from("startups")
    .select("id, status")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!existing && !create) return NextResponse.json({ error: "No listing" }, { status: 404 });

  const safe = await maskProse({
    fields: patch,
    proseFields: LISTING_PROSE_FIELDS,
    surface: "listing_prose",
    // Before the first save there is no listing to hang the signal on, and
    // trust_signals takes a bare account as a subject for exactly this.
    subjectType: existing ? "startup" : "profile",
    subjectId: existing?.id ?? user.id,
  });
  const withheld = safe.masked.length
    ? { contactsWithheld: safe.masked, maskedFields: safe.changed }
    : {};

  if (existing) {
    const { error } = await supabase
      .from("startups")
      .update({
        ...safe.fields,
        // A live listing STAYS live when edited. It used to flip back to
        // pending_review, so a founder fixing a typo vanished from the market
        // until re-approved; the edit is stamped for the admin re-check
        // instead.
        ...(existing.status === "active" ? { edited_since_review_at: new Date().toISOString() } : {}),
      } as never)
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

  const name = typeof patch.name === "string" ? patch.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data: created, error } = await supabase
    .from("startups")
    .insert({
      owner_id: user.id,
      slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
      status: "pending_review",
      subscription_tier: "free",
      ...safe.fields,
    } as never)
    .select("id")
    .single();
  if (error || !created) {
    // Postgres messages are for logs, not founders -- but the constraint
    // messages the tier caps raise are written for them, so they pass.
    return NextResponse.json({ error: error?.message || "Could not create" }, { status: 400 });
  }
  return NextResponse.json({ id: (created as { id: string }).id, created: true, ...withheld });
}
