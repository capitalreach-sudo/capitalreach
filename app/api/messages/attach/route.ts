import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
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
  const note = ((formData.get("body") as string | null) ?? "").trim();

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

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      // A caption if one was written, else the filename — the thread list's
      // preview and notifications stay meaningful either way.
      body: note || safeName,
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

  return NextResponse.json({ message });
}
