import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { sendNdaEnvelope } from "@/lib/docusign";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId, investorId } = await req.json();
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

  // Get startup owner email
  const { data: startupOwner } = await adminClient
    .from("profiles")
    .select("email, full_name")
    .eq("id", startup.owner_id)
    .single();

  // Get investor + owner details
  const { data: investor } = await adminClient
    .from("investors")
    .select("id, owner_id")
    .eq("id", investorId)
    .single();

  const { data: investorOwner } = await adminClient
    .from("profiles")
    .select("email, full_name")
    .eq("id", investor?.owner_id)
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
