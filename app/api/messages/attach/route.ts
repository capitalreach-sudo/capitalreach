import { NextRequest, NextResponse } from "next/server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { getSafetyConfig, applyMessageSafety } from "@/lib/message-safety";
import { sanitiseAttachmentName, type SanitisedAttachmentName } from "@/lib/attachment-name";
import { dealRegistrationRequired } from "@/lib/deal-registration";
import { mayInvestorContact, contactRefusal, contactsUnlocked } from "@/lib/contact-policy";
import { notifyUser } from "@/lib/notify-user";
import { sendNewMessageEmail } from "@/lib/resend";
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
    .select("id, status, startup_id, investor_id, recipient_startup_id, recipient_investor_id, startup:startups!threads_startup_id_fkey(name, owner_id), investor:investors!threads_investor_id_fkey(owner_id, display_name), recipient_investor:investors!threads_recipient_investor_id_fkey(owner_id, display_name)")
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
  // Keyed on the seal. This used to ask dealRegistrationRequired, which
  // answers "not required" when that retired feature is switched off, and the
  // negation turned that into "already registered" -- masking off.
  const dealRegistered = isPair && pairStartupId && pairInvestorId
    ? await contactsUnlocked({ startupId: pairStartupId, investorId: pairInvestorId })
    // Nothing to withhold between two investors, or on a thread with no
    // startup/investor pair the obligation could attach to.
    : true;
  // The displayed filename is masked on the same terms as the body: a file
  // called "call-me-+49-170-1234567.pdf" was a phone number in plain sight,
  // rendered as a link label and handed back as the download name. Only the
  // display name changes -- `path` above is a UUID, so the object stays where
  // it is and stays downloadable.
  const display: SanitisedAttachmentName = safetyCfg.maskContacts && !dealRegistered
    ? sanitiseAttachmentName(safeName)
    : { name: safeName, masked: [] };
  // A caption if one was written, else the filename -- the thread list's
  // preview stays meaningful either way, and the filename is the sanitised
  // one, so a file-only message reads as its own attachment rather than
  // saying the same thing twice.
  const safe = applyMessageSafety({ body: note || display.name, dealRegistered, config: safetyCfg });

  const maskedKinds = Array.from(new Set([...(safe.flags?.masked ?? []), ...display.masked]));
  const flags = { ...(safe.flags ?? {}), ...(maskedKinds.length ? { masked: maskedKinds } : {}) };

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      body: safe.body,
      // Evidence, per migration 117, and never readable by a client key. With
      // no caption the filename IS the message, so the name as sent is what
      // belongs here.
      body_original: safe.bodyOriginal ?? (!note && display.masked.length ? safeName : null),
      // Serialised through JSON so the typed jsonb column accepts it.
      safety_flags: Object.keys(flags).length ? JSON.parse(JSON.stringify(flags)) : null,
      attachment_path: path,
      attachment_name: display.name,
    })
    .select()
    .single();

  if (insertError || !message) {
    // No orphaned objects: a file no message points at is undeletable junk.
    await admin.storage.from("message-attachments").remove([path]);
    return NextResponse.json({ error: "Could not send the attachment." }, { status: 500 });
  }

  await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});

  // Tell everyone on the thread who isn't the sender, exactly as a reply does.
  // Without this an attachment arrived in silence -- no bell, no email -- and
  // waited for the recipient to happen to open the thread. Awaited: on Vercel
  // an un-awaited promise after the response is simply never run.
  //
  // Everything that leaves this route -- preview and email alike -- is built
  // from the MASKED body and the sanitised name. The notification path sits
  // outside the table the mask protects, so a raw copy here would hand over
  // exactly what the mask withheld.
  let recipientStartupOwner: string | null = null;
  if (thread.recipient_startup_id) {
    const { data: rs } = await admin.from("startups").select("owner_id").eq("id", thread.recipient_startup_id).maybeSingle();
    recipientStartupOwner = rs?.owner_id ?? null;
  }
  const recipientInvestorOwner = (thread.recipient_investor as unknown as { owner_id: string } | null)?.owner_id ?? null;
  const recipients = Array.from(new Set(
    (coInvestorThread
      ? [thread.investor?.owner_id, recipientInvestorOwner]
      : [thread.startup?.owner_id, thread.investor?.owner_id, recipientStartupOwner])
      .filter((id): id is string => !!id && id !== user.id),
  ));
  if (recipients.length) {
    const [{ data: sender }, { data: profiles }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      admin.from("profiles").select("id, email").in("id", recipients),
    ]);
    const senderName = sender?.full_name || thread.investor?.display_name || "Someone";
    const preview = safe.body.slice(0, 60) + (safe.body.length > 60 ? "…" : "");
    for (const r of recipients) {
      await notifyUser({
        userId: r,
        type: "message",
        title: `New message from ${senderName}`,
        body: preview,
        href: `/dashboard/messages?thread=${threadId}`,
      }).catch(() => {});
    }
    // Email carries a 60-char preview only, the full text lives on the
    // platform (part of the deal record), which is also where replies happen.
    for (const p of profiles ?? []) {
      if (p.email) await sendNewMessageEmail(p.email, senderName, thread.startup?.name || "your conversation", preview).catch(() => {});
    }
  }

  return NextResponse.json({
    message,
    // Never rewrite somebody's words without telling them -- including when
    // what was rewritten is the filename rather than the caption.
    ...(maskedKinds.length ? { contactsWithheld: maskedKinds } : {}),
  });
}
