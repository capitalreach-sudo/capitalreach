import { NextRequest, NextResponse } from "next/server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { getSafetyConfig, applyMessageSafety } from "@/lib/message-safety";
import { dealRegistrationRequired } from "@/lib/deal-registration";
import { mayInvestorContact, contactRefusal } from "@/lib/contact-policy";
import { uploadRatelimit } from "@/lib/redis";
import { myThreadIds } from "@/lib/threads";

/**
 * Send a message that carries a file.
 *
 * One route does upload + message insert atomically-enough: if the insert
 * fails the uploaded object is removed, so the bucket cannot accumulate
 * orphans that no message points at (the same clean-up contract the document
 * upload route established).
 *
 * The bucket is private and also enforces its own 10MB / mime allowlist at
 * the storage layer, so the checks here are for good error messages, not the
 * security boundary.
 */
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Every other message path refuses a suspended account; this one did not,
  // so a suspended user could still reach the other side through a caption.
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  // Shares the upload budget with document uploads on purpose — it is one
  // "files onto the platform" pipe, not two separate quotas to farm.
  const { success: withinRate } = await uploadRatelimit.limit(`upload:${user.id}`);
  if (!withinRate) {
    return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data body required" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  const threadId = formData.get("threadId") as string | null;
  const note = ((formData.get("body") as string | null) ?? "").trim().slice(0, 5000);

  if (!file || !threadId) {
    return NextResponse.json({ error: "file and threadId required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is over 10 MB." }, { status: 413 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "That file type can't be attached. PDF, images and Office files work." }, { status: 415 });
  }

  // Same membership rule as every other message operation (lib/threads).
  const ids = await myThreadIds(user.id);
  if (!ids.includes(threadId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // A caption on a file is a message, so this route has to answer the same
  // two questions /api/messages/reply answers before anything is written:
  // may this person speak to the other side at all, and do contact details
  // in what they wrote get withheld. Both need the thread's two sides.
  const { data: thread } = await admin
    .from("threads")
    .select("id, status, startup_id, investor_id, recipient_investor_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  // A blocked conversation is blocked. reply refuses these with 409; this
  // route accepted uploads into them, which made the block advisory.
  if (thread.status === "archived" || thread.status === "blocked") {
    return NextResponse.json({ error: "This conversation is closed" }, { status: 409 });
  }

  // Co-investor threads have a second investor as the counterparty; two
  // investors talking about a company are not transacting with it, so
  // neither the offer rule nor the deal-registration masking applies.
  const coInvestorThread = !!thread.recipient_investor_id;
  const pairStartupId = thread.startup_id;
  const pairInvestorId = thread.investor_id;
  const isPair = !coInvestorThread && !!pairStartupId && !!pairInvestorId;

  // Offer before contact, enforced BEFORE the upload so a refusal costs the
  // caller nothing and leaves no object in the bucket. Only the investor
  // side of a startup/investor thread is gated: the founder side may always
  // answer, and admins moderate rather than transact.
  if (isPair && pairStartupId && pairInvestorId) {
    const [{ data: inv }, { data: st }] = await Promise.all([
      admin.from("investors").select("owner_id").eq("id", pairInvestorId).maybeSingle(),
      admin.from("startups").select("owner_id").eq("id", pairStartupId).maybeSingle(),
    ]);
    let investorSide = !!inv?.owner_id && inv.owner_id === user.id;
    if (!investorSide && st?.owner_id !== user.id) {
      // An associate acting for a fund is the investor side just as much as
      // its owner. A STARTUP seat wins a tie, so nobody on the founder side
      // is gated by an incidental seat on an investor's roster.
      const { data: seats } = await admin
        .from("team_members").select("entity_type")
        .eq("user_id", user.id)
        .in("entity_id", [pairStartupId, pairInvestorId]);
      const kinds = new Set((seats ?? []).map((s) => s.entity_type));
      investorSide = !kinds.has("startup") && kinds.has("investor");
    }
    if (investorSide) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (prof?.role !== "admin") {
        const contact = await mayInvestorContact({ startupId: pairStartupId, investorId: pairInvestorId });
        if (!contact.allowed) return NextResponse.json(contactRefusal(contact), { status: 403 });
      }
    }
  }

  // The stored name is opaque; the human name lives on the message row. That
  // way a filename like "../../x.pdf" or unicode soup can never shape a path.
  const safeName = file.name.slice(0, 200);
  const path = `${threadId}/${crypto.randomUUID()}`;

  const { error: uploadError } = await admin.storage
    .from("message-attachments")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  // Same masking rule as every other message path. This route had none at
  // all, which made the attachment box a hole straight through the feature:
  // a phone number typed as a caption was stored and displayed verbatim
  // while the identical words in a plain reply were withheld. The browser
  // reads this table directly, so it has to happen on write.
  const safetyCfg = await getSafetyConfig();
  const dealRegistered = isPair && pairStartupId && pairInvestorId
    ? !(await dealRegistrationRequired({ startupId: pairStartupId, investorId: pairInvestorId })).required
    // Nothing to withhold between two investors, or on a thread with no
    // startup/investor pair to register a deal against.
    : true;
  // A caption if one was written, else the filename -- the thread list's
  // preview stays meaningful either way, and the filename goes through the
  // same mask because a caption smuggled into a filename is still a caption.
  const safe = applyMessageSafety({ body: note || safeName, dealRegistered, config: safetyCfg });

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      body: safe.body,
      body_original: safe.bodyOriginal,
      // Serialised through JSON so the typed jsonb column accepts it.
      safety_flags: safe.flags ? JSON.parse(JSON.stringify(safe.flags)) : null,
      attachment_path: path,
      attachment_name: safeName,
    })
    .select()
    .single();

  if (insertError || !message) {
    // No orphaned objects: a file no message points at is undeletable junk.
    await admin.storage.from("message-attachments").remove([path]);
    return NextResponse.json({ error: "Could not send the attachment." }, { status: 500 });
  }

  // The row carries the MASKED body straight from the insert, so the only
  // preview this route hands back is the same text the recipient will read.
  // It sends no email and raises no notification, so there is no second copy
  // of the caption anywhere that could still be the raw text.
  return NextResponse.json({
    message,
    // Never rewrite somebody's words without telling them.
    ...(safe.maskedAnything ? { contactsWithheld: safe.flags?.masked ?? [] } : {}),
  });
}
