import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * /dashboard had no page of its own -- only /dashboard/startup, /investor,
 * /messages and /settings. Anything pointing at the bare path 404'd for a
 * signed-in user, and several transactional emails do exactly that
 * (sendWelcomeEmail, sendDealClosedEmail, sendProfileUnderReviewEmail).
 *
 * It is also the natural landing spot for a signed-in user who clicks a
 * signup link, which middleware used to bounce to the marketing homepage.
 */
export default async function DashboardIndex() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") redirect("/admin");
  if (profile?.role === "investor") redirect("/dashboard/investor");
  if (profile?.role === "startup") redirect("/dashboard/startup");

  // Signed in with no role resolved yet -- send them to pick one rather than
  // leaving them on a blank page.
  redirect("/onboarding/startup");
}
