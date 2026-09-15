import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { uploadRatelimit } from "@/lib/redis";

/**
 * A logo for one row of a startup's `customers` list (migration 141).
 *
 * Sibling to /api/logo, not a repurposing of it: that route is one canonical
 * path per entity ("one logo, not a history of them"), which is wrong for a
 * list of several customer marks that can be added, reordered and removed
 * independently. This route keeps the same rules (raster only, 2MB, paid
 * plan, service-role write) but paths by a client-generated row id inside the
 * startup's own folder, so each customer logo has a stable URL of its own and
 * removing a row from the array is enough -- there is no second place a
 * customer's mark needs deleting from.
 *
 * Same PUBLIC "logos" bucket as /api/logo (090_logos.sql) -- a customer mark
 * is exactly the kind of brand image that bucket exists for, and creating a
 * second public bucket for the same purpose would be new infrastructure this
 * feature does not need.
 *
 * POST multipart: file, rowId (client-generated, e.g. crypto.randomUUID()).
 */

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const ROW_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { success } = await uploadRatelimit.limit(`customer-logo:${user.id}`);
  if (!success) return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "multipart/form-data body required" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  const rowId = String(form.get("rowId") ?? "");
  if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });
  if (!ROW_ID_RE.test(rowId)) return NextResponse.json({ error: "Invalid row id" }, { status: 400 });
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "PNG, JPEG or WebP only." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Logo must be under 2 MB." }, { status: 400 });

  const admin = createAdminClient();
  const { data: startup } = await admin
    .from("startups")
    .select("id, subscription_tier")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!startup) return NextResponse.json({ error: "Nothing to attach a logo to." }, { status: 403 });

  // Same rule as /api/logo: profile imagery is a paid feature, admins
  // bypass. A free listing showing customer marks would otherwise turn the
  // bucket into a free image host for anyone who signs up.
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin" && (!startup.subscription_tier || startup.subscription_tier === "free")) {
    return NextResponse.json({ error: "Profile images are part of the paid plans. Upgrade to add yours.", upgrade: true }, { status: 402 });
  }

  const path = `customer-logos/${startup.id}/${rowId}.${ext}`;
  const buffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("logos")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (upErr) {
    console.error("[customer-logo] upload failed:", upErr);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("logos").getPublicUrl(path);
  return NextResponse.json({ url: `${pub.publicUrl}?v=${Date.now()}` });
}
