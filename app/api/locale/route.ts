import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LOCALES } from "@/lib/locale";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { locale } = body as { locale?: string };

  if (!locale || !(LOCALES as string[]).includes(locale)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const res = NextResponse.json({ success: true, locale });

  res.cookies.set("cr_locale", locale, {
    path:     "/",
    maxAge:   60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("X-Locale-Changed", locale);

  // Persist to profile when authenticated
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ preferred_locale: locale })
        .eq("id", user.id);
    }
  } catch {
    /* not authenticated — cookie only is fine */
  }

  return res;
}
