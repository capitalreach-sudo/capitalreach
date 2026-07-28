import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // If Supabase isn't configured yet (or is using placeholder values), allow all requests through
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("placeholder")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    // Protect dashboard, onboarding, admin routes
    const protectedPaths = ["/dashboard", "/onboarding", "/admin"];
    const isProtected = protectedPaths.some(p => pathname.startsWith(p));

    if (isProtected && !user) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Suspension + admin guard — one profile read covers both.
    // /suspended and /auth are exempt so a suspended user can still reach the
    // explanation page and sign out instead of bouncing in a redirect loop.
    const exemptFromSuspensionCheck =
      pathname.startsWith("/suspended") || pathname.startsWith("/auth");

    if (user && !exemptFromSuspensionCheck) {
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
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

  } catch (e) {
    // Middleware should never crash the app — fail open
    console.error("[middleware] error:", e);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
