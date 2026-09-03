import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { dbRateLimit } from "@/lib/db-rate-limit";
import { isUuid } from "@/lib/utils";

/**
 * Record one profile interaction (migration 107).
 *
 * The clicks that mean the most on a marketplace -- somebody opened the
 * website, played the demo, opened the booking calendar, shared the listing --
 * were all bare anchor tags. This is the single write path: the event enum is
 * DB-checked and re-checked here, the entity is verified to be a real, live
 * profile, and the response is 204 no matter what, because a tracker that can
 * break the page it measures is worse than no tracker.
 *
 * Anonymous events are accepted (an anonymous click is real interest); the
 * viewer id rides along when a session exists. Signed-in users are capped via
 * the DB limiter; anonymous bursts are bounded by the enum and the fact that
 * an insert per click on a marketing page is cheap and truthful.
 */

const EVENTS = new Set([
  "website_click", "linkedin_click", "twitter_click", "producthunt_click",
  "booking_open", "video_play", "share_copy", "share_social", "onepager_open",
]);

export async function POST(req: NextRequest) {
  try {
    const { entityType, entityId, event } = await req.json().catch(() => ({}));
    if (!["startup", "investor"].includes(entityType)) return new NextResponse(null, { status: 204 });
    if (!isUuid(entityId ?? "")) return new NextResponse(null, { status: 204 });
    if (!EVENTS.has(event)) return new NextResponse(null, { status: 204 });

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { ok } = await dbRateLimit(user.id, "profile_event", 120, 3_600_000);
      if (!ok) return new NextResponse(null, { status: 204 });
    }

    const admin = createAdminClient();
    // Only live, public profiles accumulate events -- a draft or an unlisted
    // profile must not be probeable through its counter.
    const exists = entityType === "startup"
      ? (await admin.from("startups").select("id").eq("id", entityId).eq("status", "active").maybeSingle()).data
      : (await admin.from("investors").select("id").eq("id", entityId).eq("is_public", true).eq("is_external", false).maybeSingle()).data;
    if (!exists) return new NextResponse(null, { status: 204 });

    await admin.from("profile_events").insert({
      entity_type: entityType, entity_id: entityId, event,
      viewer_id: user?.id ?? null,
    });
  } catch {
    // Never let tracking surface an error to the page.
  }
  return new NextResponse(null, { status: 204 });
}
