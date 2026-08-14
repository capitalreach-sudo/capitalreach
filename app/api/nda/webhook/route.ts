import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { logSystemEvent } from "@/lib/system-events";
import { createAdminClient } from "@/lib/supabase-server";
import { sendNdaSignedEmail } from "@/lib/resend";
import { notifyUsers } from "@/lib/notify-user";

// DocuSign Connect webhook — fires when envelope status changes
// Configure in DocuSign Admin > Connect > Add Configuration
// URL: https://your-domain.com/api/nda/webhook

// DocuSign signs each Connect message with an HMAC-SHA256 over the raw body,
// base64-encoded in the X-DocuSign-Signature-1 header. Verify it so an attacker
// who guesses an envelope id can't POST here to mark an NDA signed and unlock a
// data room. Fails closed when the key is set; when unset (DocuSign not yet
// configured) the endpoint stays inert-but-open, as before.
function verifyDocusignSignature(rawBody: string, header: string | null): boolean {
  const key = process.env.DOCUSIGN_CONNECT_HMAC_KEY;
  if (!key) return true; // not configured — no signing to verify against
  if (!header) return false;
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  if (!verifyDocusignSignature(body, req.headers.get("x-docusign-signature-1"))) {
    await logSystemEvent("webhook/nda", "error", "Rejected NDA webhook with bad signature", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the DocuSign Connect XML payload
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
    await logSystemEvent("webhook/nda", "error", "NDA record not found for envelope", { envelopeId });
    return NextResponse.json({ received: true });
  }

  // Mark as signed
  await adminClient
    .from("nda_records")
    .update({ signed_at: new Date().toISOString() })
    .eq("id", nda.id);

  // nda_records has no deal_id of its own — attribute this signature to the
  // most-recently-updated open deal for this pair, falling back to the most
  // recent deal overall if none is currently open (best-effort attribution).
  const { data: dealsForPair } = await adminClient
    .from("deals")
    .select("id, status")
    .eq("startup_id", nda.startup_id)
    .eq("investor_id", nda.investor_id)
    .order("updated_at", { ascending: false });
  const targetDeal = dealsForPair?.find(d => d.status !== "closed" && d.status !== "passed") ?? dealsForPair?.[0];
  if (targetDeal) {
    await adminClient.from("deal_activity").insert({
      deal_id: targetDeal.id,
      startup_id: nda.startup_id,
      investor_id: nda.investor_id,
      actor_id: null,
      type: "nda_signed",
      body: null,
    });
  }

  // Get email addresses for both parties
  const { data: startup } = await adminClient
    .from("startups")
    .select("name, slug, owner_id, owner:profiles(email)")
    .eq("id", nda.startup_id)
    .single();

  const { data: investor } = await adminClient
    .from("investors")
    .select("owner_id, owner:profiles(email)")
    .eq("id", nda.investor_id)
    .single();

  const startupEmail = startup?.owner?.email;
  const investorEmail = investor?.owner?.email;

  // An NDA coming back signed unlocks gated material on the listing, so both
  // sides need to know it happened -- the investor to go read it, the founder
  // to know it was read.
  await notifyUsers([startup?.owner_id, investor?.owner_id], {
    type:  "nda_signed",
    title: `NDA signed — ${startup?.name ?? "a startup"}`,
    // The NDA is pair-level -- there may be no deal yet. What it unlocks is
    // the gated documents on the listing, so that is where this points.
    href:  startup?.slug ? `/startups/${startup.slug}` : "/deals",
  });

  if (startupEmail && investorEmail && startup?.name) {
    await sendNdaSignedEmail(startupEmail, investorEmail, startup.name).catch(() => {});
  }

  return NextResponse.json({ received: true });
}
