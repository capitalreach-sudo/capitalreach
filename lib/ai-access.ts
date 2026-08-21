import { createAdminClient } from "@/lib/supabase-server";
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
 * Launch mode deliberately does NOT reach in here. It grants visibility and
 * volume — model calls are a per-use cost, and "free during launch" turns a
 * marketing window into an open bill. AI is paid, full stop, admin excepted.
 *
 * Signed-out visitors never qualify. There is no plan behind an anonymous
 * request, and an unauthenticated model endpoint is somebody else's free API.
 *
 * Two levels exist:
 *  - "ai":        the plan includes any model-backed feature (scores, matching).
 *  - "assistant": the site assistant, reserved for the TOP plan on each side
 *                 (founders: Growth, investors: Institution). It is the most
 *                 expensive feature per use and the clearest reason to be on
 *                 the biggest plan.
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

export async function checkAiAccess(userId: string | null, feature: "ai" | "assistant" = "ai"): Promise<AiAccess> {
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

  // The entity's own tier governs, as everywhere else: an admin grant lands on
  // the listing or the investor profile, not on the owner's profile row.
  const [{ data: startup }, { data: investor }] = await Promise.all([
    admin.from("startups").select("subscription_tier").eq("owner_id", userId).maybeSingle(),
    admin.from("investors").select("subscription_tier").eq("owner_id", userId).maybeSingle(),
  ]);

  const entityTier = profile.role === "startup" ? startup?.subscription_tier : investor?.subscription_tier;
  // isLaunch is passed as false ON PURPOSE: launch mode must never grant a
  // metered model feature (see the header comment).
  const ctx = buildAccessContext(
    { ...profile, subscription_tier: entityTier ?? profile.subscription_tier },
    false,
  );

  if (ctx.suspended) return DENY("suspended", null);

  const tier = entityTier ?? profile.subscription_tier;

  if (feature === "assistant") {
    // Top plan only, on either side of the marketplace.
    const allowed = profile.role === "startup" ? tier === "growth" : tier === "institution";
    if (allowed) return { allowed: true, reason: "ok", needsPlan: null, isAdmin: false };
    return DENY("plan", profile.role === "startup" ? "Growth" : "Institution");
  }

  // "Has AI" means the plan already includes a model-backed feature. Reusing
  // the existing capability rather than adding a parallel flag keeps one
  // answer to "is this account paying for AI".
  const allowed = profile.role === "startup"
    ? founderCan(ctx).aiPitchScore
    : investorCan(ctx).aiScore;

  if (allowed) return { allowed: true, reason: "ok", needsPlan: null, isAdmin: false };
  return DENY("plan", profile.role === "startup" ? "Starter" : "Angel");
}
