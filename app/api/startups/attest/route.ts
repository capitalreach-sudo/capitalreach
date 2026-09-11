import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";
import {
  FOUNDER_ATTESTATION_VERSION,
  founderAttestationText,
  attestationHash,
  attestationStateFrom,
} from "@/lib/legal/founder-attestation";

/**
 * The founder's signature on their own listing.
 *
 * The four founder_attestation_* columns sit behind
 * startups_attestation_server_only (126), so the owner cannot write their own
 * signature from the browser even though the row is otherwise theirs. This
 * route is the only path to them, which is the point: a signature the signer
 * can backdate or edit is not evidence of anything.
 *
 * The client never sends the hash. GET renders the document and POST renders
 * it again and hashes what IT rendered, so what was signed is whatever the
 * server would show, not whatever the browser claims it showed.
 *
 * legal_entity_name is read here and returned to the founder inside the
 * statement text. That is one of the two audiences 109 allows for it -- the
 * founder about their own company, and an admin -- and it must not leak
 * further, so this route refuses anyone who is not the owner before it
 * renders anything at all.
 */

interface Owned {
  id: string;
  owner_id: string;
  name: string | null;
  legal_entity_name: string | null;
  founder_attestation_at: string | null;
  founder_attestation_version: string | null;
  founder_attestation_sha256: string | null;
}

/** Resolves the listing only for its owner. Everything else is a 404: an
 *  attestation endpoint that answers 403 for a real id and 404 for a fake one
 *  tells a stranger which listings exist. */
async function ownedStartup(
  startupId: string,
): Promise<{ startup: Owned; profileName: string | null } | { error: NextResponse }> {
  if (!isUuid(startupId)) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Sign in to continue" }, { status: 401 }) };
  }

  const admin = createAdminClient();
  const { data: startup, error } = await admin
    .from("startups")
    .select("id, owner_id, name, legal_entity_name, founder_attestation_at, founder_attestation_version, founder_attestation_sha256")
    .eq("id", startupId)
    .maybeSingle();

  // Surfaced rather than folded into the not-found branch. A failed read and a
  // listing that is not yours look identical from here, and answering "not
  // found" to a founder whose own listing exists would send them to support
  // over a database blip.
  if (error) {
    console.error("[startups/attest] listing read failed:", error.message);
    return { error: NextResponse.json({ error: "Could not load the statement" }, { status: 500 }) };
  }
  if (!startup || startup.owner_id !== user.id) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  if (profileError) {
    // Only feeds the loose name comparison in the modal, which warns rather
    // than blocks, so a failure here costs a warning and not the signature.
    console.warn("[startups/attest] profile read failed:", profileError.message);
  }

  return { startup: startup as Owned, profileName: profile?.full_name ?? null };
}

function renderFor(startup: Owned): { text: string; sha256: string } {
  const text = founderAttestationText({
    legalEntityName: startup.legal_entity_name,
    displayName: startup.name,
  });
  return { text, sha256: attestationHash(text) };
}

export async function GET(req: NextRequest) {
  const resolved = await ownedStartup(req.nextUrl.searchParams.get("startupId") ?? "");
  if ("error" in resolved) return resolved.error;

  const { startup, profileName } = resolved;
  const { text, sha256 } = renderFor(startup);
  const state = attestationStateFrom(startup);

  return NextResponse.json({
    text,
    version: FOUNDER_ATTESTATION_VERSION,
    sha256,
    profileName,
    // Present only when the signature on file is against the wording now in
    // force. A founder who signed an older version is asked again rather than
    // shown as current, which is what the checklist's attestation item reads.
    attestedAt: state.current ? state.attestedAt : null,
  });
}

export async function POST(req: NextRequest) {
  let body: { startupId?: unknown; signedName?: unknown; agreed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const resolved = await ownedStartup(typeof body.startupId === "string" ? body.startupId : "");
  if ("error" in resolved) return resolved.error;
  const { startup } = resolved;

  if (body.agreed !== true) {
    return NextResponse.json({ error: "Confirm the statement to continue" }, { status: 400 });
  }
  const signedName = typeof body.signedName === "string" ? body.signedName.trim() : "";
  // The modal warns on a loose mismatch and does not block, so the only rule
  // here is that something was typed. A founder signing "Jack B." for "Jack
  // Boritzki" is a real signature; refusing it would stop a real listing.
  if (signedName.length < 2 || signedName.length > 120) {
    return NextResponse.json({ error: "Type your full name to sign" }, { status: 400 });
  }

  const { text, sha256 } = renderFor(startup);
  const attestedAt = new Date().toISOString();

  // Same first-hop rule as the seal and the watermark ledger: a chain arrives
  // when a proxy is in front, and only the first entry is the client.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("startups")
    .update({
      founder_attestation_at: attestedAt,
      founder_attestation_version: FOUNDER_ATTESTATION_VERSION,
      founder_attestation_sha256: sha256,
      founder_attestation_ip: ip,
    })
    .eq("id", startup.id);

  if (error) {
    console.error("[startups/attest] could not record attestation:", error.message);
    return NextResponse.json({ error: "Could not record the statement" }, { status: 500 });
  }

  return NextResponse.json({
    attestedAt,
    version: FOUNDER_ATTESTATION_VERSION,
    sha256,
    // Returned so a caller can log or display exactly what was signed without
    // rendering it a third time and risking a different set of bytes.
    text,
  });
}
