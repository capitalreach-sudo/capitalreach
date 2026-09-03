"use client";

/**
 * Fire-and-forget profile interaction tracking (client side of /api/track).
 *
 * sendBeacon where available: most tracked clicks NAVIGATE (website, LinkedIn,
 * a share intent), and a plain fetch started in a click handler is aborted
 * when the page unloads -- exactly the moment the event happens. The beacon
 * survives navigation; keepalive fetch is the fallback. Failures are silently
 * dropped: tracking must never cost the user anything.
 */
export type ProfileEvent =
  | "website_click" | "linkedin_click" | "twitter_click" | "producthunt_click"
  | "booking_open" | "video_play" | "share_copy" | "share_social" | "onepager_open";

export function track(entityType: "startup" | "investor", entityId: string, event: ProfileEvent): void {
  try {
    const body = JSON.stringify({ entityType, entityId, event });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let tracking throw into a click handler */
  }
}
