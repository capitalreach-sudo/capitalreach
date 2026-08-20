import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { uploadRatelimit } from "@/lib/redis";

/**
 * Logo upload, for a startup listing or an investor profile.
 *
 * Raster images only — png, jpeg, webp. SVG is refused on purpose: an SVG is
 * a document that can carry script, and while an <img> tag will not execute
 * it, the same file opened directly from the bucket URL will. A logo slot
 * that accepts SVG is a script-hosting service with extra steps.
 *
 * The path in the bucket is derived from the entity id, never from the file
 * name, and each upload overwrites the previous one — an entity has one logo,
 * not a history of them, and stale logos should not accumulate in a public
 * bucket forever.
 *
 * POST multipart: file, entityType ("startup" | "investor"), color? (#rrggbb,
 * sampled client-side — no image processing happens on the server).
 * DELETE ?entityType= — remove the logo.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function ownEntity(admin: ReturnType<typeof createAdminClient>, userId: string, entityType: string) {
  if (entityType === "startup") {
    const { data } = await admin.from("startups").select("id").eq("owner_id", userId).maybeSingle();
    return data ? { table: "startups" as const, id: data.id } : null;
  }
  if (entityType === "investor") {
    const { data } = await admin.from("investors").select("id").eq("owner_id", userId).maybeSingle();
    return data ? { table: "investors" as const, id: data.id } : null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { success } = await uploadRatelimit.limit(`logo:${user.id}`);
  if (!success) return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "multipart/form-data body required" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  const entityType = String(form.get("entityType") ?? "");
  const colorRaw = String(form.get("color") ?? "");
  const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : null;

  if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "PNG, JPEG or WebP only." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Logo must be under 2 MB." }, { status: 400 });

  const admin = createAdminClient();
  const entity = await ownEntity(admin, user.id, entityType);
  if (!entity) return NextResponse.json({ error: "Nothing to attach a logo to." }, { status: 403 });

  // One canonical path per entity. A version query-param busts caches on
  // replacement, so a changed logo shows up without the old URL going dead.
  const path = `${entity.table}/${entity.id}.${ext}`;
  const buffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("logos")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (upErr) {
    console.error("[logo] upload failed:", upErr);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("logos").getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: dbErr } = await admin
    .from(entity.table)
    .update({ logo_url: url, logo_color: color })
    .eq("id", entity.id);
  if (dbErr) return NextResponse.json({ error: "Could not save the logo" }, { status: 500 });

  return NextResponse.json({ url, color });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entityType = req.nextUrl.searchParams.get("entityType") ?? "";
  const admin = createAdminClient();
  const entity = await ownEntity(admin, user.id, entityType);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await admin.storage.from("logos").remove([
    `${entity.table}/${entity.id}.png`,
    `${entity.table}/${entity.id}.jpg`,
    `${entity.table}/${entity.id}.webp`,
  ]);
  await admin.from(entity.table).update({ logo_url: null, logo_color: null }).eq("id", entity.id);
  return NextResponse.json({ success: true });
}
