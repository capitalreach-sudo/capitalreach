import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { notifyUser } from "@/lib/notify-user";
import { NDA_VERSION } from "@/lib/nda-text";

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
    .select("id, owner_id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!investor) {
    return NextResponse.json({ error: "Only investors can accept an NDA" }, { status: 403 });
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

  const { error } = await admin.from("nda_records").upsert(
    {
      startup_id: startupId,
      investor_id: investor.id,
      signed_at: new Date().toISOString(),
      method: "clickwrap",
      nda_version: NDA_VERSION,
      signed_ip: ip,
      signed_ua: ua,
    },
    { onConflict: "startup_id,investor_id" },
  );
  if (error) {
    console.error("[nda/accept] upsert failed:", error.message);
    return NextResponse.json({ error: "Could not record acceptance" }, { status: 500 });
  }

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
