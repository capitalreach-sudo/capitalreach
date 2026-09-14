"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Whether a Supabase session cookie is present.
 *
 * A rendering hint, never an authorization: it only decides whether chrome
 * that has not resolved the viewer yet may show signed-out CTAs. It costs no
 * database or auth round trip, and anything gated still verifies the session
 * itself.
 *
 * The server value seeds the first paint so SSR and hydration agree. It is
 * re-read from document.cookie after every navigation and whenever the layout
 * re-renders, because a client-side sign-in or sign-out changes the cookie
 * without re-rendering the root layout. The auth cookies are written with
 * httpOnly: false (@supabase/ssr defaults, app/auth/callback/route.ts), so the
 * browser can see them.
 */

// Must match the predicate in app/layout.tsx: sb-<ref>-auth-token, or its
// .0/.1/... chunks once the session outgrows one cookie. The PKCE code
// verifier shares the prefix but is not a session.
const SESSION_COOKIE = /^sb-.+-auth-token(?:\.\d+)?$/;

function readSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((pair) => SESSION_COOKIE.test(pair.split("=")[0]?.trim() ?? ""));
}

const SessionHintContext = createContext(false);

export function SessionHintProvider({
  hasSession,
  children,
}: {
  hasSession: boolean;
  children: React.ReactNode;
}) {
  const [hint, setHint] = useState(hasSession);
  const pathname = usePathname();

  useEffect(() => {
    setHint(readSessionCookie());
  }, [hasSession, pathname]);

  return <SessionHintContext.Provider value={hint}>{children}</SessionHintContext.Provider>;
}

/** False outside the provider, which renders exactly the signed-out chrome. */
export function useSessionHint(): boolean {
  return useContext(SessionHintContext);
}
