"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

/**
 * Whether the signed-in member has Messages at all.
 *
 * A member has Messages only once a deal they are party to is sealed
 * (lib/messaging-access); an admin always does. Every entry point to the inbox
 * renders only when this is true, and renders nothing while it is null, so an
 * entry never appears for somebody it is not for.
 *
 * One request per page load however many entry points ask: the promise is
 * cached at module scope, and /api/messages/unread already answers the
 * question. The answer changes when the signed-in user changes or a deal is
 * sealed, so those re-ask and every mounted caller hears the new value.
 *
 * `enabled` false means "nobody is signed in here": no request, and null.
 */
let cached: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();

function load(): Promise<boolean> {
  return fetch("/api/messages/unread", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { available?: unknown } | null) => j?.available === true)
    .catch(() => false);
}

/** Drops the cached answer and asks again; mounted callers update when it lands. */
export function refreshMessagingAvailable(): void {
  const next = load();
  cached = next;
  void next.then((v) => {
    if (cached === next) listeners.forEach((l) => l(v));
  });
}

// One subscription for the whole page, not one per caller: a change of user is
// one re-ask, however many entry points are mounted.
let watching = false;
let lastUserId: string | null | undefined;
function watchIdentity() {
  if (watching) return;
  watching = true;
  try {
    createClient().auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;
      if (lastUserId === undefined) { lastUserId = id; return; }
      if (id !== lastUserId) {
        lastUserId = id;
        refreshMessagingAvailable();
      }
    });
  } catch {
    // No browser client means no identity changes to follow.
  }
}

export function useMessagingAvailable(enabled = true): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) { setAvailable(null); return; }
    let alive = true;
    const set = (v: boolean) => { if (alive) setAvailable(v); };
    listeners.add(set);
    watchIdentity();
    cached ??= load();
    const asked = cached;
    void asked.then((v) => { if (cached === asked) set(v); });
    return () => {
      alive = false;
      listeners.delete(set);
    };
  }, [enabled]);

  return enabled ? available : null;
}
