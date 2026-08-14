import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";
import { myThreadIds } from "@/lib/threads";

/**
 * Download an attachment: ?id=<message id> → 302 to a short-lived signed URL.
 *
 * The bucket is private, so this route IS the read-side access control: it
 * re-checks that the caller belongs to the message's thread before minting
 * the URL. Sixty seconds of validity is enough for the redirect to land and
 * useless to paste anywhere.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!isUuid(id ?? "")) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: message } = await admin
    .from("messages")
    .select("thread_id, attachment_path, attachment_name")
    .eq("id", id!)
    .single();
  if (!message?.attachment_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ids = await myThreadIds(user.id);
  if (!ids.includes(message.thread_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signed, error } = await admin.storage
    .from("message-attachments")
    .createSignedUrl(message.attachment_path, 60, {
      download: message.attachment_name ?? true,
    });
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not open the file." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
