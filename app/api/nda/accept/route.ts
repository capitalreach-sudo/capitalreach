import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { investorGate, planRequired } from "@/lib/plan-gate";
import { notifyUser } from "@/lib/notify-user";
import { NDA_VERSION, ndaText } from "@/lib/nda-text";
import { sha256, buildCounterparty, recipientFrom, obligationsEnd } from "@/lib/nda-record";
import { recordIntroduction } from "@/lib/introductions";
import { evaluateGate, gateRefusal, getGateConfig, investorGateSubject } from "@/lib/trust-gates";

/**
 * In-app NDA acceptance (clickwrap). The investor agrees to the confidentiality
 * undertaking and the data room opens immediately — no dependency on a
 * configured DocuSign account, which is what left the old flow stuck at
 * "pending" forever. We record who accepted, when, from where, and which
 * version of the wording, so the acceptance is auditable.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const { startupId } = await req.json().catch(() => ({}));
  if (typeof startupId !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  // The startup must exist, be live, and actually require an NDA.
  const { data: startup } = await admin
    .from("startups")
    .select("id, name, owner_id, status, require_nda")
    .eq("id", startupId)
    .single();
  if (!startup || startup.status !== "active") {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (!startup.require_nda) {
    return NextResponse.json({ error: "This listing does not require an NDA" }, { status: 400 });
  }

  // The caller must be the investor accepting for their own investor entity.
  const { data: investor } = await supabase
    .from("investors")
    .select("id, owner_id, display_name, firm_name, trust_level, trust_expires_at")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!investor) {
    return NextResponse.json({ error: "Only investors can accept an NDA" }, { status: 403 });
  }

  // Plan gate: signing NDAs (and the documents behind them) is a paid
  // capability -- investorCan().ndaRequest, the same matrix the pricing page
  // sells from. Derived through investorGate, so launch mode lifts this gate
  // like every other paywall while it is on.
  const caps = await investorGate(user.id);
  if (!caps.ndaRequest) {
    return NextResponse.json(planRequired("Signing NDAs", "Angel"), { status: 402 });
  }

  const { data: attest } = await admin
    .from("profiles").select("role, accreditation_certified").eq("id", user.id).maybeSingle();

  // Trust gate: a SECOND, independent check beside the plan gate above. An NDA
  // taken against an unidentified name is unenforceable paper, so the party
  // signing it has to be an identified human (level 2) as well as a paying
  // one. Refused before any nda_records row is written.
  if (attest?.role !== "admin") {
    const gateSubject = await investorGateSubject(user.id);
    if (gateSubject) {
      const verdict = evaluateGate("dataroom", gateSubject, await getGateConfig());
      if (!verdict.allowed) return NextResponse.json(gateRefusal(verdict), { status: 403 });
    }
  }

  // Protected financials are shared on the strength of this attestation --
  // require it before the room opens. Attestable any time from Settings.
  if (!attest?.accreditation_certified) {
    return NextResponse.json(
      { error: "Confirm your accredited-investor status in Settings to open data rooms." },
      { status: 403 },
    );
  }

  // Already accepted? Return success idempotently so the UI just unlocks.
  const { data: existing } = await admin
    .from("nda_records")
    .select("id, signed_at")
    .match({ startup_id: startupId, investor_id: investor.id })
    .maybeSingle();
  if (existing?.signed_at) {
    return NextResponse.json({ success: true, alreadySigned: true });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent")?.slice(0, 400) ?? null;

  // Who the Recipient IS, captured now. They can rename themselves tomorrow;
  // the undertaking was given by the person named here, at the trust level
  // they held at the time.
  const { data: prof } = await admin
    .from("profiles").select("id, full_name").eq("id", user.id).maybeSingle();
  const counterparty = buildCounterparty(
    { id: user.id, full_name: prof?.full_name ?? null },
    investor,
    investor.trust_level,
  );

  // The exact bytes agreed to, hashed. A version string alone cannot prove
  // the wording was not edited afterwards; this can.
  const signedAt = new Date();
  const agreedText = ndaText(startup.name, recipientFrom(counterparty));

  const { data: ndaRow, error } = await admin.from("nda_records").upsert(
    {
      startup_id: startupId,
      investor_id: investor.id,
      signed_at: signedAt.toISOString(),
      method: "clickwrap",
      nda_version: NDA_VERSION,
      signed_ip: ip,
      signed_ua: ua,
      text_sha256: sha256(agreedText),
      counterparty: JSON.parse(JSON.stringify(counterparty)),
      obligations_end_at: obligationsEnd(signedAt),
    },
    { onConflict: "startup_id,investor_id" },
  ).select("id").single();
  if (error) {
    console.error("[nda/accept] upsert failed:", error.message);
    return NextResponse.json({ error: "Could not record acceptance" }, { status: 500 });
  }

  // Signing an NDA is contact. If this pair had no introduction on record
  // yet, the fee claim's clock starts here -- and if they did, the earlier
  // date stands (recordIntroduction never overwrites a first contact).
  await recordIntroduction({ startupId, investorId: investor.id, channel: "nda" });

  // Tell the founder their data room was unlocked. Awaited — Vercel freezes
  // the lambda at response and a floating notify would be dropped.
  await notifyUser({
    userId: startup.owner_id,
    type: "nda_signed",
    title: `NDA accepted — data room opened`,
    body: `An investor accepted your NDA and can now see your protected documents.`,
    href: `/startups/${startup.id}`,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
