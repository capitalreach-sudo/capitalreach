import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-guard";
import { sendListingLiveEmail } from "@/lib/resend";
import { notifyUser } from "@/lib/notify-user";
import { scoreStartup, isOpenAIConfigured } from "@/lib/openai";
import { evaluateGate, gateRefusal, getGateConfig, startupGateSubject } from "@/lib/trust-gates";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;

  const { startupId } = await req.json().catch(() => ({}));
  const adminClient = createAdminClient();

  const { data: startup } = await adminClient
    .from("startups")
    .select("*, founders:startup_founders(*), documents:startup_documents(*), milestones:startup_milestones(*), owner:profiles(email, full_name)")
    .eq("id", startupId)
    .single();

  if (!startup) return NextResponse.json({ error: "Startup not found" }, { status: 404 });

  // The publish gate is on the LISTING, never on the operator clicking the
  // button. Approval is a judgement about the pitch; level 3 is a register
  // confirming the company exists and that this founder may act for it, which
  // no amount of admin goodwill can substitute. The attack this stops is the
  // one that cannot be undone: a real company listed by a stranger.
  const gateSubject = await startupGateSubject(startupId);
  if (gateSubject) {
    const verdict = evaluateGate("publish", gateSubject, await getGateConfig());
    if (!verdict.allowed) {
      return NextResponse.json(
        {
          ...gateRefusal(verdict),
          // The refusal body is the founder-facing contract; the operator
          // needs plain words for why their click did nothing.
          adminMessage:
            `Not approved. This listing stands at trust level ${verdict.held} and publishing requires level ${verdict.required}. ` +
            `The founder has to reach level ${verdict.required} (company registry and director authority) before the listing can go live.`,
        },
        { status: 403 },
      );
    }
  }

  // Approve and set active
  await adminClient
    .from("startups")
    .update({ status: "active", listed_at: new Date().toISOString(), edited_since_review_at: null })
    .eq("id", startupId);

  // Log admin action
  await adminClient.from("admin_actions").insert({
    admin_id: guard.adminId,
    target_id: startupId,
    target_type: "startup",
    action: "approve",
  });

  // Score on approval (best-effort — skipped if OpenAI not configured).
  // Awaited: "kick off in background" does not exist on Vercel -- the lambda
  // freezes when the response returns, so the un-awaited score write never
  // landed. A few seconds of extra latency on an admin action is the honest
  // price of the score actually being saved.
  if (isOpenAIConfigured) {
    await scoreStartup({
      name: startup.name,
      problem: startup.problem,
      solution: startup.solution,
      market: startup.market,
      competitive_advantage: startup.competitive_advantage,
      mrr: startup.mrr,
      arr: startup.arr,
      user_count: startup.user_count,
      growth_rate: startup.growth_rate,
      founders: startup.founders || [],
      documents: startup.documents || [],
      milestones: startup.milestones || [],
      stage: startup.stage,
    }).then(score =>
      adminClient.from("startups").update({ vaultrise_score: score, scored_at: new Date().toISOString() }).eq("id", startupId)
    ).catch(() => {});
  }

  // Going live is the moment a founder has been waiting on since they
  // submitted, and until now the only word of it was an email that never sent.
  if (startup.owner_id) {
    await notifyUser({
      userId: startup.owner_id,
      type:   "listing_approved",
      title:  `${startup.name} is live`,
      body:   "Your listing is now visible to investors.",
      href:   `/startups/${startup.slug}`,
    });
  }

  // Send approval email
  const ownerEmail = startup.owner?.email;
  if (ownerEmail) {
    await sendListingLiveEmail(
      ownerEmail,
      startup.name,
      startup.slug
    ).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
