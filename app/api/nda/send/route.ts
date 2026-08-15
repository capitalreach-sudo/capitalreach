import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { sendNdaEnvelope } from "@/lib/docusign";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isTeamMemberOfEither } from "@/lib/membership";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A suspended account must not be able to write. The RESTRICTIVE policies in
  // 017 don't cover this route because the write goes through the service role.
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }


  const { startupId, investorId } = await req.json().catch(() => ({}));
  if (typeof startupId !== "string" || typeof investorId !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const adminClient = createAdminClient();

  // Get startup + owner details
  const { data: startup } = await adminClient
    .from("startups")
    .select("id, name, require_nda, owner_id")
    .eq("id", startupId)
    .single();

  if (!startup || !startup.require_nda) {
    return NextResponse.json({ error: "NDA not required for this startup" }, { status: 400 });
  }

  // Get investor + owner details
  const { data: investor } = await adminClient
    .from("investors")
    .select("id, owner_id")
    .eq("id", investorId)
    .single();

  if (!investor) return NextResponse.json({ error: "Investor not found" }, { status: 404 });

  // The caller must be one of the two parties this NDA is between (or a team
  // member on either side — same rule as closing a deal). Without this, any
  // signed-in user could mail a DocuSign envelope to an arbitrary
  // founder/investor pair and write an nda_records row on their behalf.
  if (startup.owner_id !== user.id && investor.owner_id !== user.id) {
    const isMember = await isTeamMemberOfEither(user.id, startup.id, investor.id);
    if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get startup owner email
  const { data: startupOwner } = await adminClient
    .from("profiles")
    .select("email, full_name")
    .eq("id", startup.owner_id)
    .single();
  const { data: investorOwner } = await adminClient
    .from("profiles")
    .select("email, full_name")
    .eq("id", investor.owner_id)
    .single();

  if (!startupOwner || !investorOwner) {
    return NextResponse.json({ error: "Could not find user details" }, { status: 400 });
  }

  // Check if NDA already exists
  const { data: existing } = await adminClient
    .from("nda_records")
    .select("id, signed_at, docusign_envelope_id")
    .match({ startup_id: startupId, investor_id: investorId })
    .single();

  if (existing?.signed_at) {
    return NextResponse.json({ message: "NDA already signed", signed: true });
  }

  // Send DocuSign envelope
  let envelopeId: string | null = null;
  try {
    envelopeId = await sendNdaEnvelope({
      startupName: startup.name,
      startupEmail: startupOwner.email,
      startupSignerName: startupOwner.full_name || "Startup Founder",
      investorEmail: investorOwner.email,
      investorName: investorOwner.full_name || "Investor",
    });
  } catch (err) {
    console.error("DocuSign error:", err);
    return NextResponse.json({ error: "Failed to send NDA envelope" }, { status: 500 });
  }

  // Upsert NDA record
  await adminClient.from("nda_records").upsert(
    { startup_id: startupId, investor_id: investorId, docusign_envelope_id: envelopeId },
    { onConflict: "startup_id,investor_id" }
  );

  return NextResponse.json({ success: true, envelopeId });
}
