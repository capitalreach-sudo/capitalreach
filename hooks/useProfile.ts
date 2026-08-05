"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/types";

/**
 * The signed-in profile, fetched once per page load no matter how many
 * components ask for it.
 *
 * The navbar used to be the only component that needed this, so it did its own
 * getUser() + profiles select inline. The mobile tab bar and the command
 * palette need the same two facts (are you signed in, and what role are you),
 * and three copies of that pair would mean three round trips on every
 * navigation. The promise is cached at module scope, so the second and third
 * caller await the first caller's request.
 *
 * The cache is keyed to nothing but the module instance, which is exactly the
 * lifetime we want: a full reload after sign-in or sign-out starts fresh, and
 * within a session the auth listener below clears it the moment the user
 * changes, so a signed-out tab can never keep rendering a stale identity.
 */
let cached: Promise<Profile | null> | null = null;

function fetchProfile(): Promise<Profile | null> {
  const supabase = createClient();
  return supabase.auth
    .getUser()
    .then(async ({ data }) => {
      if (!data.user) return null;
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();
      return (p as Profile | null) ?? null;
    })
    .catch(() => null);
}

export function resetProfileCache() {
  cached = null;
}

export function useProfile(): { profile: Profile | null; loading: boolean } {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = () => {
      cached ??= fetchProfile();
      cached.then((p) => {
        if (!alive) return;
        setProfile(p);
        setLoading(false);
      });
    };
    run();

    // Sign-in and sign-out both invalidate the cached identity. Without this a
    // user who signs out client-side would keep seeing their tab bar until a
    // hard reload.
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        cached = null;
        run();
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { profile, loading };
}
