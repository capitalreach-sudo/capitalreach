import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SECTOR_SLUGS } from "@/lib/industry-slugs";

// Known sector slugs, resolved once per isolate. industry-slugs derives them
// from the shared INDUSTRIES list, and its import chain (types, lib/utils,
// lib/display-locale) is pure string work with no node builtins, so it is
// safe in the edge runtime.
const VALID_SECTOR_SLUGS = new Set(SECTOR_SLUGS.map((s) => s.slug));

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Unknown sector URLs must answer a REAL 404. The page's notFound() fires
  // only after the streamed shell has committed a 200, so crawlers filed
  // /startups/sector/anything-invalid as a soft 404. Rewriting to a path no
  // route serves makes Next render the not-found page with status 404 before
  // anything streams. Needs no auth, so it runs before the Supabase gate.
  const sectorMatch = pathname.match(/^\/startups\/sector\/([^/]+)\/?$/);
  if (sectorMatch) {
    let slug = sectorMatch[1];
    // The route param arrives decoded; the raw pathname may not be.
    try { slug = decodeURIComponent(slug); } catch {}
    if (!VALID_SECTOR_SLUGS.has(slug)) {
      return NextResponse.rewrite(new URL("/not-found", request.url), { status: 404 });
    }
  }

  // If Supabase isn't configured yet (or is using placeholder values), allow all requests through
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("placeholder")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  // Prefixes middleware actually gates: the protected areas, /deals (its
  // suspension + AAL gate lives only here), and authenticated API traffic (so
  // the second factor is enforced for API calls, not just page navigation).
  const gatedPrefixes = ["/dashboard", "/onboarding", "/admin", "/deals"];
  // Member-only pages, matched exactly rather than by prefix: /investors/<slug>
  // profiles decide their own visibility. Both sit under a loading.tsx, so the
  // page's own redirect() lands after the streamed shell has committed a 200 and
  // can only bounce an anonymous visitor client-side, under a 200 carrying the
  // page title. Only middleware can answer that request with a real 307.
  const memberOnlyPages = ["/investors", "/data"];
  // Member-only sections, matched by whole path segment: the deal room and
  // every deal, any contract, the verification application and the suspension
  // notice. An anonymous visitor gets the same real 307 to sign-in as the
  // pages above.
  const memberOnlySections = ["/deals", "/contracts", "/verify", "/suspended"];
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const isMemberOnlyPage = memberOnlyPages.includes(normalizedPath);
  const isMemberOnlySection = memberOnlySections.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isGatedPage = isMemberOnlyPage || isMemberOnlySection || gatedPrefixes.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api");
  // Only authenticated API calls pay the auth round trip; anonymous and webhook
  // calls (no session cookie) fast-lane, and a route that needs auth enforces
  // it itself. The cookie name is sb-<ref>-auth-token(.N).
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  const apiWithSession = isApi && hasSession;
  // The login and signup pages must reach the signed-in redirect below, which
  // the fast lane would otherwise skip. Only a request carrying a session
  // cookie can need that redirect, so anonymous visitors (the common case on
  // these pages) still pay no auth round trip.
  const isAuthEntryPage = pathname === "/auth/login" || pathname === "/auth/signup";

  const loginRedirect = () => {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  };
  const mfaJson = () =>
    NextResponse.json(
      { error: "Two-factor authentication required.", code: "mfa_required" },
      { status: 401 },
    );

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options as any)
            );
          },
        },
      }
    );

    // The fast lane: middleware's auth round-trip runs ONLY where it gates
    // something: the protected areas, the member-only pages and sections, and
    // authenticated API calls. Public pages and anonymous/webhook API calls
    // skip it entirely: the browser client refreshes tokens itself and server
    // pages read the cookies directly.
    if (!isGatedPage && !apiWithSession && !(isAuthEntryPage && hasSession)) {
      return supabaseResponse;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Protect dashboard, onboarding, admin routes
    const protectedPaths = ["/dashboard", "/onboarding", "/admin"];
    const isProtected = isMemberOnlyPage || protectedPaths.some(p => pathname.startsWith(p));

    if ((isProtected || isMemberOnlySection) && !user) {
      return loginRedirect();
    }

    // 2FA enforcement. A password-only session on an account with a verified
    // TOTP factor is AAL1; without this check the login page's code prompt is a
    // curtain, not a gate. Enforced for the protected pages AND /deals AND
    // every authenticated API call — the API gap is what let a password-only
    // attacker reach every mutating and admin route. Computed from the session
    // JWT and its factor list, so it costs no extra network round trip.
    if (user) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const pending = !!aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
      if (pending) {
        if (apiWithSession) return mfaJson();
        if (isGatedPage) return loginRedirect();
      }
    }

    // Suspension + admin guard — one profile read covers both.
    // /suspended and /auth are exempt so a suspended user can still reach the
    // explanation page and sign out instead of bouncing in a redirect loop.
    // /dashboard/complaints is exempt so a suspended user can read and file an
    // appeal.
    const exemptFromSuspensionCheck =
      pathname.startsWith("/suspended") ||
      pathname.startsWith("/auth") ||
      pathname === "/dashboard/complaints" ||
      pathname.startsWith("/dashboard/complaints/");

    // Pages only: this is a navigation redirect, and it costs a profile read.
    // API routes enforce suspension themselves (isAccountSuspended) and must
    // not be bounced to an HTML page, so they take only the AAL gate above.
    if (user && !isApi && !exemptFromSuspensionCheck) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, suspended, account_status")
        .eq("id", user.id)
        .single();

      const suspended = profile?.suspended
        || profile?.account_status === "suspended"
        || profile?.account_status === "banned";

      // Gated areas only — a suspended user may still read public pages.
      if (suspended && (isProtected || pathname.startsWith("/deals"))) {
        return NextResponse.redirect(new URL("/suspended", request.url));
      }

      if (pathname.startsWith("/admin") && profile?.role !== "admin") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    // Redirect authenticated users away from auth pages.
    //
    // This used to send them to "/", which made every "List your startup"
    // button on the site look broken to anyone already signed in: the links
    // point at /auth/signup, so clicking one bounced straight back to the
    // marketing homepage with nothing to show for it. /dashboard resolves by
    // role and forwards to onboarding when there is no listing yet, which is
    // where someone clicking that button actually wants to end up.
    if (user && (pathname === "/auth/login" || pathname === "/auth/signup")) {
      // Only when fully authenticated. A session waiting on its 2FA code is
      // exactly where it belongs on /auth/login -- bouncing it to /dashboard
      // would ping-pong against the AAL check above forever.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const waitingOnMfa = aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
      if (!waitingOnMfa) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

  } catch (e) {
    // Fail CLOSED for anything gated. An error here used to return next() with
    // no redirect, which briefly lifted the suspension, admin and AAL gates
    // during any transient Supabase error. Public paths still fail open; a
    // gated page bounces to login, an authenticated API call gets a 401.
    console.error("[middleware] error:", e);
    if (apiWithSession) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isGatedPage) return loginRedirect();
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
