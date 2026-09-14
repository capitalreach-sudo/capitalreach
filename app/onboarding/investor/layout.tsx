import { redirect } from "next/navigation";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Investor onboarding renders for an investor account and nobody else.
 *
 * The role is read with the service role, fresh from profiles on every
 * request, and never from the URL or the client: a ?role= link cannot open
 * this form for the wrong account type. POST /api/account/switch-role writes
 * profiles.role before RoleSwitchLink navigates here, so a switched account
 * passes on arrival.
 *
 * A wrong role goes to its own onboarding while it owns no entity, and to its
 * own dashboard once it does. Admins go to the console.
 */
export const dynamic = "force-dynamic";

export default async function InvestorOnboardingGate({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/onboarding/investor");

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  // An unreadable role is refused, not guessed. The error boundary is the only
  // safe landing: /dashboard sends an unresolved role on to onboarding.
  if (error) throw new Error("Onboarding gate could not read the account role.");

  const role = profile?.role;
  if (role === "investor") return <>{children}</>;
  if (role === "admin") redirect("/admin");

  if (role === "startup") {
    const { data: owned, error: ownedErr } = await admin
      .from("startups")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    if (ownedErr) throw new Error("Onboarding gate could not read the account's listing.");
    redirect(owned ? "/dashboard/startup" : "/onboarding/startup");
  }

  // No profile row or no recognised role: the fork is where a type is chosen.
  redirect("/onboarding");
}
