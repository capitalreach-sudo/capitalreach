import { createServerSupabaseClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/resend";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  // Explicit redirect from middleware (e.g. "?redirect=/dashboard/startup")
  const explicitRedirect = requestUrl.searchParams.get("redirect");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    if (data.user) {
      // Check whether a profile already exists
      const { data: existing } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", data.user.id)
        .single();

      // Role priority: existing DB record → OAuth user_metadata → URL query param → default
      const roleFromQuery = requestUrl.searchParams.get("role");
      const role =
        existing?.role ||
        data.user.user_metadata?.role ||
        (roleFromQuery === "startup" || roleFromQuery === "investor" ? roleFromQuery : null) ||
        "investor";

      if (!existing) {
        // First-time OAuth signup — create the profile
        const fullName =
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          "";
        await supabase.from("profiles").insert({
          id: data.user.id,
          email: data.user.email!,
          full_name: fullName,
          avatar_url: data.user.user_metadata?.avatar_url,
          role,
          subscription_tier: "free",
        });
        // Send welcome email (best-effort — don't block the redirect)
        sendWelcomeEmail(data.user.email!, fullName, role).catch(() => {});
      }

      // If the middleware set an explicit redirect target, honour it
      if (explicitRedirect && explicitRedirect !== "/") {
        return NextResponse.redirect(
          new URL(explicitRedirect, requestUrl.origin)
        );
      }

      // Otherwise determine the best landing page based on onboarding status
      if (role === "investor") {
        const { data: inv } = await supabase
          .from("investors")
          .select("id")
          .eq("owner_id", data.user.id)
          .single();

        if (!inv) {
          return NextResponse.redirect(
            new URL("/onboarding/investor", requestUrl.origin)
          );
        }
        return NextResponse.redirect(
          new URL("/dashboard/investor", requestUrl.origin)
        );
      }

      if (role === "startup") {
        const { data: startup } = await supabase
          .from("startups")
          .select("id")
          .eq("owner_id", data.user.id)
          .single();

        if (!startup) {
          return NextResponse.redirect(
            new URL("/onboarding/startup", requestUrl.origin)
          );
        }
        return NextResponse.redirect(
          new URL("/dashboard/startup", requestUrl.origin)
        );
      }

      if (role === "admin") {
        return NextResponse.redirect(new URL("/admin", requestUrl.origin));
      }
    }
  }

  // Fallback — go to home
  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
