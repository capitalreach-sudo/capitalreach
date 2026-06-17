import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { sendNdaSignedEmail } from "@/lib/resend";

// DocuSign Connect webhook — fires when envelope status changes
// Configure in DocuSign Admin > Connect > Add Configuration
// URL: https://your-domain.com/api/nda/webhook
export async function POST(req: NextRequest) {
  const body = await req.text();

  // Parse the DocuSign Connect XML payload
  // In production, verify the HMAC signature from DocuSign
  let envelopeId: string | null = null;
  let status: string | null = null;

  try {
    // Simple XML parsing (use a proper XML parser in production)
    const envelopeMatch = body.match(/<EnvelopeID>(.*?)<\/EnvelopeID>/);
    const statusMatch = body.match(/<Status>(.*?)<\/Status>/);
    envelopeId = envelopeMatch?.[1] || null;
    status = statusMatch?.[1]?.toLowerCase() || null;
  } catch (err) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!envelopeId || status !== "completed") {
    return NextResponse.json({ received: true });
  }

  const adminClient = createAdminClient();

  // Find the NDA record by envelope ID
  const { data: nda } = await adminClient
    .from("nda_records")
    .select("id, startup_id, investor_id")
    .eq("docusign_envelope_id", envelopeId)
    .single();

  if (!nda) {
    console.error("NDA record not found for envelope:", envelopeId);
    return NextResponse.json({ received: true });
  }

  // Mark as signed
  await adminClient
    .from("nda_records")
    .update({ signed_at: new Date().toISOString() })
    .eq("id", nda.id);

  // Get email addresses for both parties
  const { data: startup } = await adminClient
    .from("startups")
    .select("name, owner:profiles(email)")
    .eq("id", nda.startup_id)
    .single();

  const { data: investor } = await adminClient
    .from("investors")
    .select("owner:profiles(email)")
    .eq("id", nda.investor_id)
    .single();

  const startupEmail = (startup?.owner as any)?.email;
  const investorEmail = (investor?.owner as any)?.email;

  if (startupEmail && investorEmail && startup?.name) {
    await sendNdaSignedEmail(startupEmail, investorEmail, startup.name).catch(() => {});
  }

  return NextResponse.json({ received: true });
}
