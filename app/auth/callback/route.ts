import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/resend";
import { NextResponse } from "next/server";
import { LOCALES, type Locale } from "@/lib/locale";
import { safeRedirect } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  // Only a same-origin path is honoured. new URL() drops the base for absolute
  // or protocol-relative input ("//evil.com") and folds "/\evil.com" off-site
  // too, and this redirect fires right after login, the exact polished moment
  // a phishing page wants. lib/safe-redirect refuses every one of those.
  const redirectPath = safeRedirect(requestUrl.searchParams.get("redirect"), "/");

  // A link that cannot become a session here (opened on another device,
  // expired, already used, or refused by the provider) lands on sign-in, which
  // explains it and offers a new confirmation email. The destination survives.
  const linkExpired = () => {
    const url = new URL("/auth/login", requestUrl.origin);
    url.searchParams.set("error", "link_expired");
    if (redirectPath !== "/") url.searchParams.set("redirect", redirectPath);
    return NextResponse.redirect(url);
  };

  const providerError =
    requestUrl.searchParams.get("error") ||
    requestUrl.searchParams.get("error_code") ||
    requestUrl.searchParams.get("error_description");
  if (!code || providerError) return linkExpired();

  const supabase = await createServerSupabaseClient();
  const exchange = await supabase.auth.exchangeCodeForSession(code).catch((err: unknown) => {
    console.error("[auth/callback] code exchange threw:", err instanceof Error ? err.message : err);
    return null;
  });
  if (!exchange || exchange.error || !exchange.data.user) return linkExpired();
  const data = { user: exchange.data.user };

  const { data: existing } = await supabase
    .from("profiles")
    .select("id, role, preferred_locale, suspended, account_status")
    .eq("id", data.user.id)
    .single();

  // Suspended accounts get an explanation, not a working session. Middleware
  // enforces this too, but catching it at the login moment avoids a pointless
  // bounce through the dashboard first.
  if (
    existing?.suspended ||
    existing?.account_status === "suspended" ||
    existing?.account_status === "banned"
  ) {
    return NextResponse.redirect(new URL("/suspended", requestUrl.origin));
  }

  const roleFromQuery = requestUrl.searchParams.get("role");
  const queryRole =
    roleFromQuery === "startup" || roleFromQuery === "investor" ? roleFromQuery : null;
  // F: the invite code rides the OAuth redirect URL because signInWithOAuth
  // cannot set user metadata. Normalized exactly like /api/invites/lookup so
  // the code compares equal at redemption.
  const inviteFromQuery = (requestUrl.searchParams.get("invite") ?? "").trim().toUpperCase().slice(0, 32);

  const metaRole = data.user.user_metadata?.role;
  let role = existing?.role || metaRole || queryRole || "investor";

  // Arrival data on the URL counts only while this login IS the signup. The
  // auth trigger creates the profile before this route runs, so "no profile
  // yet" cannot identify a new OAuth account -- account age can, and outside
  // this window a crafted ?role= link must not flip an existing account.
  const isFreshAccount =
    !!data.user.created_at &&
    Date.now() - new Date(data.user.created_at).getTime() < 10 * 60 * 1000;
  const isArrival = isFreshAccount && !metaRole && (!!queryRole || !!inviteFromQuery);

  // True once profiles.role actually holds queryRole. Routing and the metadata
  // stash both wait for it: metadata that says startup over a profile that
  // says investor is a split every gate resolves differently.
  let roleSettled = false;

  if (isArrival && queryRole && existing) {
    if (existing.role === queryRole) {
      roleSettled = true;
    } else if (existing.role !== "admin") {
      // The role chosen on the signup page beats the trigger's investor
      // default this once. role is server-only on profiles
      // (reject_client_column_write refuses a client-key UPDATE of it), so the
      // write goes through the service role.
      const { error: roleErr } = await createAdminClient()
        .from("profiles")
        .update({ role: queryRole })
        .eq("id", data.user.id);
      if (roleErr) {
        console.error("[auth/callback] role override failed:", roleErr.message);
      } else {
        role = queryRole;
        roleSettled = true;
      }
    }
  }

  if (!existing) {
    const fullName =
      data.user.user_metadata?.full_name ||
      data.user.user_metadata?.name ||
      "";
    const { error: insertErr } = await supabase.from("profiles").insert({
      id: data.user.id,
      email: data.user.email!,
      full_name: fullName,
      avatar_url: data.user.user_metadata?.avatar_url,
      role,
      subscription_tier: "free",
      // Captured at signup; OAuth users accept via the same checkbox before
      // the provider redirect, so fall back to now rather than leaving it null.
      terms_accepted_at:
        data.user.user_metadata?.terms_accepted_at || new Date().toISOString(),
    });
    if (insertErr) {
      // Routing follows the stored row, never the row this request hoped to
      // write.
      console.error("[auth/callback] profile insert failed:", insertErr.message);
      const { data: stored } = await createAdminClient()
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (stored?.role) role = stored.role;
    } else if (isArrival && queryRole && role === queryRole) {
      roleSettled = true;
    }
    sendWelcomeEmail(data.user.email!, fullName, role).catch(() => {});
  }

  if (isArrival) {
    // Writing the settled role to metadata records the choice so a later login
    // cannot re-litigate it, and invite_code lands where the /api/auth/welcome
    // redemption path -- the same one the password flow triggers on first
    // authenticated load -- already looks for it.
    const stash = {
      ...(roleSettled && queryRole ? { role: queryRole } : {}),
      ...(inviteFromQuery ? { invite_code: inviteFromQuery } : {}),
    };
    if (Object.keys(stash).length > 0) {
      try {
        const { error: stashErr } = await supabase.auth.updateUser({ data: stash });
        if (stashErr) console.error("[auth/callback] arrival stash failed:", stashErr.message);
      } catch (err) {
        // Best-effort: a lost stash costs the attribution, never the login.
        console.error("[auth/callback] arrival stash failed:", err);
      }
    }
  }

  // Determine destination URL
  let destination: URL;

  if (redirectPath !== "/") {
    destination = new URL(redirectPath, requestUrl.origin);
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
