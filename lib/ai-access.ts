import { createAdminClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";
import { buildAccessContext, founderCan, investorCan } from "@/lib/access";

/**
 * Who may use the AI features, in one place.
 *
 * Every model call costs real money on a real invoice, so AI is a paid
 * feature — with two deliberate exemptions:
 *
 *  - ADMINS always have it, on any plan and in any state. An operator
 *    investigating a listing should not be blocked by a billing rule aimed at
 *    customers, and they are the people most likely to need the tools to do
 *    support. This is not a loophole: `role = 'admin'` is set by hand in the
 *    database, and admin access is already audited elsewhere.
 *  - Launch mode, which grants the top tier to everyone by design. When it
 *    ends, this starts binding on its own — no code change.
 *
 * Signed-out visitors never qualify. There is no plan behind an anonymous
 * request, and an unauthenticated model endpoint is somebody else's free API.
 */

export interface AiAccess {
  allowed: boolean;
  /** Why not, for copy that tells the person something useful. */
  reason: "ok" | "signed_out" | "plan" | "suspended";
  /** The cheapest plan that would grant it, for the upgrade link. */
  needsPlan: string | null;
  isAdmin: boolean;
}

const DENY = (reason: AiAccess["reason"], needsPlan: string | null): AiAccess =>
  ({ allowed: false, reason, needsPlan, isAdmin: false });

export async function checkAiAccess(userId: string | null): Promise<AiAccess> {
  if (!userId) return DENY("signed_out", null);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, subscription_tier, suspended, account_status")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return DENY("signed_out", null);
  if (profile.role === "admin") {
    return { allowed: true, reason: "ok", needsPlan: null, isAdmin: true };
  }

  const { isLaunch } = await getLaunchStatus();

  // The entity's own tier governs, as everywhere else: an admin grant lands on
  // the listing or the investor profile, not on the owner's profile row.
  const [{ data: startup }, { data: investor }] = await Promise.all([
    admin.from("startups").select("subscription_tier").eq("owner_id", userId).maybeSingle(),
    admin.from("investors").select("subscription_tier").eq("owner_id", userId).maybeSingle(),
  ]);

  const entityTier = profile.role === "startup" ? startup?.subscription_tier : investor?.subscription_tier;
  const ctx = buildAccessContext(
    { ...profile, subscription_tier: entityTier ?? profile.subscription_tier },
    isLaunch,
  );

  if (ctx.suspended) return DENY("suspended", null);

  // "Has AI" means the plan already includes a model-backed feature. Reusing
  // the existing capability rather than adding a parallel flag keeps one
  // answer to "is this account paying for AI".
  const allowed = profile.role === "startup"
    ? founderCan(ctx).aiPitchScore
    : investorCan(ctx).aiScore;

  if (allowed) return { allowed: true, reason: "ok", needsPlan: null, isAdmin: false };
  return DENY("plan", profile.role === "startup" ? "Starter" : "Angel");
}
