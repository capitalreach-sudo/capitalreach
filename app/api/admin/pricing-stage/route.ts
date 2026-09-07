import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase-server";
import { announceLaunchEnd } from "@/lib/launchMode";
import { getStageStatus, STAGE_ORDER, type PricingStage } from "@/lib/pricing-stage";

/**
 * The price ladder, moved by hand: founding -> early -> standard.
 *
 * This replaces the launch-mode on/off switch. It still writes the old
 * `launch_mode` row, because half the platform reads that boolean (access.ts,
 * the homepage pill, onboarding) and a platform that disagrees with itself
 * about whether things are free is worse than one on the wrong stage.
 */

function isStage(v: unknown): v is PricingStage {
  return typeof v === "string" && (STAGE_ORDER as string[]).includes(v);
}

const TARGET_MIN = 1;
const TARGET_MAX = 10_000;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return NextResponse.json({ ...(await getStageStatus()), stages: STAGE_ORDER });
}

export async function POST(req: NextRequest) {
  // Owner only: this changes what every new customer pays.
  const guard = await requireAdmin("owner");
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  const stage = (body as { stage?: unknown }).stage;
  // Default TRUE: losing access is irreversible for the member's trust in the
  // platform, while charging them later is not. The caller opts out explicitly.
  const grandfatherFounding = (body as { grandfatherFounding?: unknown }).grandfatherFounding !== false;
  let grandfathered = 0;
  const foundingTarget = (body as { foundingTarget?: unknown }).foundingTarget;
  const wantsStage = stage !== undefined;
  const wantsTarget = foundingTarget !== undefined;

  if (!wantsStage && !wantsTarget) {
    return NextResponse.json({ error: "Send a stage, a foundingTarget, or both." }, { status: 400 });
  }
  if (wantsStage && !isStage(stage)) {
    return NextResponse.json({ error: `stage must be one of: ${STAGE_ORDER.join(", ")}` }, { status: 400 });
  }
  if (wantsTarget && (typeof foundingTarget !== "number" || !Number.isInteger(foundingTarget) || foundingTarget < TARGET_MIN || foundingTarget > TARGET_MAX)) {
    return NextResponse.json({ error: `foundingTarget must be a whole number between ${TARGET_MIN} and ${TARGET_MAX}.` }, { status: 400 });
  }

  const before = await getStageStatus();
  const admin = createAdminClient();

  if (wantsTarget) {
    const { error } = await admin
      .from("platform_config")
      .upsert({ key: "founding_target", value: String(foundingTarget) }, { onConflict: "key" });
    if (error) {
      console.error("[admin/pricing-stage] founding_target", error);
      return NextResponse.json({ error: "Could not update the founding target" }, { status: 500 });
    }
    await logAdminAction(guard.admin, guard.adminId, "founding_target_set", "platform", null, {
      from: before.target,
      to: foundingTarget,
    });
  }

  let announced = false;
  if (isStage(stage) && stage !== before.stage) {
    const { error } = await admin
      .from("platform_config")
      .upsert(
        [
          { key: "pricing_stage", value: stage },
          { key: "launch_mode", value: String(stage === "founding") },
        ],
        { onConflict: "key" },
      );
    if (error) {
      console.error("[admin/pricing-stage] pricing_stage", error);
      return NextResponse.json({ error: "Could not update the pricing stage" }, { status: 500 });
    }

    // Advancing out of founding IS the launch ending -- the same promise
    // ("free for our first N") expiring, so it is announced the same way.
    // announceLaunchEnd is idempotent: stepping founding -> early -> standard
    // does not tell everyone twice.
    if (before.stage === "founding") announced = await announceLaunchEnd("admin");

    // THE CLIFF, made explicit.
    //
    // founderTier()/investorTier() hand every member the top tier while
    // launch mode is on and fall straight back to their stored tier the
    // moment it goes off. Founding members never bought a subscription --
    // that was the whole offer -- so their stored tier is "free", and
    // advancing the stage would silently strip data rooms, NDAs, investor
    // identity and analytics from the first people who believed in the
    // platform, on the same day they were told the free period ended.
    //
    // So the decision is made here, by hand, and recorded: grandfather the
    // founding cohort onto the tier they have been using, or let them
    // convert. Nothing is implicit either way. The 2% success fee is
    // unaffected -- grandfathered members still pay it when they raise,
    // which is where the revenue actually comes from.
    if (before.stage === "founding" && grandfatherFounding) {
      // Anyone who already holds a Stripe subscription is left alone: their
      // price is whatever they signed up at, and overwriting the tier here
      // would decouple it from what they are actually being billed for.
      const [founders, investors] = await Promise.all([
        admin.from("profiles").update({ subscription_tier: "growth" })
          .eq("signup_stage", "founding").eq("role", "startup")
          .is("stripe_subscription_id", null).select("id"),
        admin.from("profiles").update({ subscription_tier: "pro_investor" })
          .eq("signup_stage", "founding").eq("role", "investor")
          .is("stripe_subscription_id", null).select("id"),
      ]);
      const founderIds = (founders.data ?? []).map((r) => r.id);
      grandfathered = founderIds.length + (investors.data ?? []).length;
      // The startups table carries its own tier for listing-level gates.
      if (founderIds.length) {
        await admin.from("startups")
          .update({ subscription_tier: "growth" })
          .in("owner_id", founderIds);
      }
    }

    await logAdminAction(guard.admin, guard.adminId, "pricing_stage_set", "platform", null, {
      from: before.stage,
      to: stage,
      announced,
      grandfatherFounding,
      grandfathered,
    });
  }

  return NextResponse.json({ ...(await getStageStatus()), stages: STAGE_ORDER, announced });
}
