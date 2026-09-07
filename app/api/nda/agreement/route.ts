import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { CONFIDENTIALITY_MONTHS, NDA_VERSION, ndaText } from "@/lib/nda-text";
import { NON_CIRCUMVENTION_MONTHS } from "@/lib/circumvention-text";
import { buildCounterparty, ndaRecordFor, obligationsEnd, recipientFrom, sha256 } from "@/lib/nda-record";
import { isUuid } from "@/lib/utils";

/**
 * The exact document the caller would be agreeing to, with the hash that will
 * be stored against their acceptance.
 *
 * A clickwrap that shows one wording and records another is worthless, and so
 * is one where the reader cannot tell which wording they saw. This route is
 * the single source the UI renders from: the same string that gets hashed, the
 * same hash the acceptance stores, with the caller's own name already in it so
 * they can see who the document says is bound.
 *
 * Deliberately NOT trust-gated. Reading the terms is a read, and a person who
 * has not verified yet is exactly the person who needs to see what verifying
 * would commit them to. The gate belongs on acceptance and on the room behind
 * it, where POST /api/nda/accept applies it.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const startupId = req.nextUrl.searchParams.get("startupId") ?? "";
  if (!isUuid(startupId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Named columns only: migration 109 revoked the startups financial columns
  // from client keys, and an admin read has no business widening that.
  const { data: startup } = await admin
    .from("startups")
    .select("id, name, status, require_nda")
    .eq("id", startupId)
    .maybeSingle();
  if (!startup || startup.status !== "active") {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const [{ data: investor }, { data: profile }] = await Promise.all([
    admin
      .from("investors")
      .select("id, display_name, firm_name, type, trust_level, trust_expires_at")
      .eq("owner_id", user.id)
      .maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!investor) {
    return NextResponse.json({ error: "Only investors sign this agreement" }, { status: 403 });
  }

  // The counterparty snapshot is built here rather than only at acceptance so
  // the text on screen names the same party the stored record will, and the
  // hash the reader is shown is the hash that ends up in the row.
  const counterparty = buildCounterparty(
    { id: user.id, full_name: profile?.full_name },
    investor,
    investor.trust_level,
  );
  const text = ndaText(startup.name, recipientFrom(counterparty));

  const existing = await ndaRecordFor(startup.id, investor.id);
  const currentSha = sha256(text);

  return NextResponse.json({
    startupId: startup.id,
    company: startup.name,
    requiresNda: !!startup.require_nda,
    version: NDA_VERSION,
    sha256: currentSha,
    text,
    recipient: {
      name: counterparty.name,
      entity: counterparty.entity,
      trustLevel: counterparty.trustLevel,
    },
    confidentialityMonths: CONFIDENTIALITY_MONTHS,
    nonCircumventionMonths: NON_CIRCUMVENTION_MONTHS,
    /** Where the term would end if the caller accepted right now. */
    obligationsEndAt: obligationsEnd(),
    signed: existing?.signedAt
      ? {
          at: existing.signedAt,
          version: existing.version,
          sha256: existing.textSha256,
          obligationsEndAt: existing.obligationsEndAt,
          // An earlier acceptance stands under the wording it agreed to. Say so
          // rather than showing today's text as if that were what was signed.
          matchesCurrent: existing.textSha256 === currentSha,
        }
      : null,
  });
}
