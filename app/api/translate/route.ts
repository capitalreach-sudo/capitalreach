import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { aiRatelimit } from "@/lib/redis";
import { isUuid } from "@/lib/utils";
import { LOCALES, type Locale } from "@/lib/locale";
import {
  TRANSLATABLE, collectFields, sourceHash, translateFields, translationAvailable,
} from "@/lib/translate";

/**
 * Translate a listing or an investor profile into the viewer's language.
 *
 * The source text is read HERE, from the database, never taken from the
 * request. A route that translated whatever text it was handed would be a free
 * translation API with somebody else's key behind it.
 *
 * Cached per (entity, locale) and keyed by a hash of the source, so the second
 * viewer in Japanese pays nothing and an edited listing retires its own
 * translation rather than showing the old numbers in a new language.
 *
 * POST { entityType, entityId, locale }
 */

const ALLOWED = ["startup", "investor"] as const;
type EntityType = (typeof ALLOWED)[number];

export async function POST(req: NextRequest) {
  if (!translationAvailable) {
    return NextResponse.json({ error: "Translation is not configured.", unavailable: true }, { status: 503 });
  }

  const { entityType, entityId, locale } = await req.json().catch(() => ({}));
  if (!ALLOWED.includes(entityType)) return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  if (!isUuid(entityId ?? "")) return NextResponse.json({ error: "entityId required" }, { status: 400 });
  if (!LOCALES.includes(locale)) return NextResponse.json({ error: "Unknown locale" }, { status: 400 });

  const type = entityType as EntityType;
  const target = locale as Locale;
  const admin = createAdminClient();

  // Only published content is translatable. An unapproved draft or a private
  // investor profile must not become readable through this route.
  const row = type === "startup"
    ? (await admin.from("startups")
        .select("id, status, tagline, problem, solution, market, competitive_advantage, use_of_funds")
        .eq("id", entityId).eq("status", "active").maybeSingle()).data
    : (await admin.from("investors")
        .select("id, is_public, is_external, bio, investment_thesis")
        .eq("id", entityId).eq("is_public", true).eq("is_external", false).maybeSingle()).data;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fields = collectFields(row as unknown as Record<string, unknown>, TRANSLATABLE[type]);
  if (Object.keys(fields).length === 0) return NextResponse.json({ fields: {}, cached: true });

  const hash = sourceHash(fields);

  const { data: cached } = await admin
    .from("content_translations")
    .select("fields, source_hash")
    .eq("entity_type", type).eq("entity_id", entityId).eq("locale", target)
    .maybeSingle();

  if (cached && cached.source_hash === hash) {
    return NextResponse.json({ fields: cached.fields, cached: true });
  }

  // Only a cache MISS costs a model call, so the limit is on the thing that
  // costs money rather than on reading a translation somebody already paid for.
  const { success } = await aiRatelimit.limit(`translate:${entityId}:${target}`);
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const translated = await translateFields(fields, target);
  if (!translated) {
    return NextResponse.json({ error: "Could not translate this right now." }, { status: 502 });
  }

  // upsert: the unique key is (entity_type, entity_id, locale), so a re-
  // translation after an edit replaces the stale row rather than accumulating.
  await admin.from("content_translations").upsert({
    entity_type: type, entity_id: entityId, locale: target,
    source_hash: hash, fields: translated,
  }, { onConflict: "entity_type,entity_id,locale" });

  return NextResponse.json({ fields: translated, cached: false });
}
