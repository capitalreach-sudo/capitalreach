import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { buildAccessContext, investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";

/**
 * Whether the signed-in viewer may see the two NAMED lists on the Data
 * Centre (topStartups, recentStartups). This privacy gate used to be copied
 * byte-for-byte in both app/data/page.tsx (first paint) and
 * app/api/platform-data/route.ts (client refresh) -- two copies of the same
 * rule with no shared source, so an edit to one could silently desync from
 * the other. Both call sites now import this single implementation instead.
 *
 * Safe by default: any failure, including no signed-in user or no profile
 * row, resolves to false. Admins and startup accounts may always name
 * listings; an investor's own plan gates on investorCan().viewListingDetail.
 */
export async function viewerMayNameStartups(): Promise<boolean> {
  try {
    const sb = await createServerSupabaseClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    const { data: prof } = await createAdminClient()
      .from("profiles").select("id, role, subscription_tier, suspended, account_status")
      .eq("id", user.id).maybeSingle();
    if (!prof) return false;
    const launch = await getLaunchStatus();
    const ctx = buildAccessContext(prof as Parameters<typeof buildAccessContext>[0], launch.isLaunch);
    return prof.role === "admin" || prof.role === "startup"
      ? true
      : investorCan(ctx).viewListingDetail;
  } catch {
    return false;
  }
}
