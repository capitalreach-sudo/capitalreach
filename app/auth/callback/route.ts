import { createServerSupabaseClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/resend";
import { NextResponse } from "next/server";
import { LOCALES, type Locale } from "@/lib/locale";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const explicitRedirect = requestUrl.searchParams.get("redirect");

  if (!code) {
    return NextResponse.redirect(new URL("/", requestUrl.origin));
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.exchangeCodeForSession(code);

  if (!data.user) {
    return NextResponse.redirect(new URL("/", requestUrl.origin));
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id, role, preferred_locale")
    .eq("id", data.user.id)
    .single();

  const roleFromQuery = requestUrl.searchParams.get("role");
  const role =
    existing?.role ||
    data.user.user_metadata?.role ||
    (roleFromQuery === "startup" || roleFromQuery === "investor" ? roleFromQuery : null) ||
    "investor";

  if (!existing) {
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
    sendWelcomeEmail(data.user.email!, fullName, role).catch(() => {});
  }

  // Determine destination URL
  let destination: URL;

  if (explicitRedirect && explicitRedirect !== "/") {
    destination = new URL(explicitRedirect, requestUrl.origin);
  } else if (role === "investor") {
    const { data: inv } = await supabase
      .from("investors")
      .select("id")
      .eq("owner_id", data.user.id)
      .single();
    destination = new URL(
      inv ? "/dashboard/investor" : "/onboarding/investor",
      requestUrl.origin
    );
  } else if (role === "startup") {
    const { data: startup } = await supabase
      .from("startups")
      .select("id")
      .eq("owner_id", data.user.id)
      .single();
    destination = new URL(
      startup ? "/dashboard/startup" : "/onboarding/startup",
      requestUrl.origin
    );
  } else if (role === "admin") {
    destination = new URL("/admin", requestUrl.origin);
  } else {
    destination = new URL("/", requestUrl.origin);
  }

  const response = NextResponse.redirect(destination);

  // Sync saved locale preference to cookie
  const savedLocale = existing?.preferred_locale;
  if (savedLocale && (LOCALES as string[]).includes(savedLocale as string)) {
    response.cookies.set("cr_locale", savedLocale as Locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
    });
  }

  return response;
}
