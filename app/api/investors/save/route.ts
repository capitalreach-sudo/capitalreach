import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { PROFILE_PROSE_FIELDS, maskProse } from "@/lib/message-safety";
import { sanitizeUrlFields, httpUrlOrNull } from "@/lib/url-safety";
import { slugify } from "@/lib/utils";
import { isAccountSuspended } from "@/lib/suspension-guard";

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

/**
 * Creating an investor profile is an investor act. The role is read with the
 * service role because it is the caller's own row being judged, never a value
 * the request carries. A team seat on an investor already places the account
 * inside one, and a second profile of its own would split every gate that
 * resolves through membership. Admins keep the create they have always had.
 * Updates to a row the caller owns never reach this.
 */
async function refuseProfileCreate(userId: string): Promise<NextResponse | null> {
  const admin = createAdminClient();
  const [{ data: profile, error: profileErr }, { count: seats, error: seatErr }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    admin.from("team_members").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("entity_type", "investor"),
  ]);
  if (profileErr || seatErr) {
    console.error("[investors/save:create-gate]", (profileErr ?? seatErr)?.message);
    return NextResponse.json({ error: "Could not verify the account." }, { status: 500 });
  }
  if (profile?.role === "admin") return null;
  if (profile?.role !== "investor") {
    return NextResponse.json(
      { error: "Only investor accounts can create an investor profile.", code: "wrong_role" },
      { status: 403 },
    );
  }
  if ((seats ?? 0) > 0) {
    return NextResponse.json(
      { error: "This account is on an investor's team and cannot create a profile of its own.", code: "team_seat" },
      { status: 403 },
    );
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const { fields, create } = await req.json().catch(() => ({}));
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return NextResponse.json({ error: "fields required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (!NOT_FROM_THE_FORM.has(key)) patch[key] = value;
  }

  // User URLs render into an anchor href on the public profile: keep only
  // http(s), normalise a scheme-less domain to https, drop javascript:/data:.
  sanitizeUrlFields(patch);

  // portfolio_json[].url is the one URL that lives inside a jsonb array
  // rather than a flat column, so sanitizeUrlFields above (flat keys only --
  // verified by reading lib/url-safety.ts, not assumed) never touches it.
  // The startup-side pass shipped press[].url with a comment claiming the
  // flat call already covered it, which it does not; sanitized inline here
  // instead, the way founders[].linkedin_url is, so that mistake is not
  // repeated on this column.
  if (Array.isArray(patch.portfolio_json)) {
    patch.portfolio_json = (patch.portfolio_json as Array<Record<string, unknown>>).map((row) => {
      if (!row || typeof row !== "object") return row;
      const next = { ...row };
      if ("url" in next) next.url = httpUrlOrNull(next.url);
      return next;
    });
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

  // Checked before masking, which records a trust signal against the account.
  if (!existing) {
    const refused = await refuseProfileCreate(user.id);
    if (refused) return refused;
  }

  const safe = await maskProse({
    fields: patch,
    proseFields: PROFILE_PROSE_FIELDS,
    // Migration 141: the free-text sub-fields inside these three jsonb
    // arrays -- a company/outcome pair, a co-investor's name, a portfolio
    // row's own name/outcome. portfolio_json[].name and .outcome were
    // already live and already rendered on the public profile with no
    // masking path at all before this pass (found during investigation,
    // not assumed); closed here while the column is being touched anyway.
    // The row's own .url is NOT listed -- it is sanitized above instead,
    // the same "a URL sub-field is not prose" rule maskProse's own doc
    // comment states.
    jsonArrayProseFields: {
      notable_exits: ["company", "outcome"],
      co_investors: ["name"],
      portfolio_json: ["name", "outcome"],
    },
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
    // Founder-facing RAISEd messages pass (tier caps P0001, contact CHECK
    // 23514); any other raw Postgres message is for the logs, not the user.
    if (error && (error.code === "P0001" || error.code === "23514")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[investors/save:create]", error);
    return NextResponse.json({ error: "Could not create the profile." }, { status: 400 });
  }
  return NextResponse.json({ id: (created as { id: string }).id, created: true, ...withheld });
}
