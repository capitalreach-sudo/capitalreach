import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { sendNewMessageEmail } from "@/lib/resend";
import { messageRatelimit } from "@/lib/redis";
import { getLaunchStatus } from "@/lib/launchMode";
import { buildAccessContext, canSendMessages, getMessageLimit } from "@/lib/access";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId, investorId, body: messageBody } = await req.json();

  if (!messageBody?.trim()) {
    return NextResponse.json({ error: "Message body required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Verify investor owns this investorId and check tier
  const { data: investor } = await adminClient
    .from("investors")
    .select("id, subscription_tier, owner_id")
    .eq("id", investorId)
    .single();

  if (!investor || investor.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { isLaunch } = await getLaunchStatus();
  const ctx = buildAccessContext({ id: user.id, role: "investor", subscription_tier: investor.subscription_tier }, isLaunch);

  if (!canSendMessages(ctx)) {
    return NextResponse.json({ error: "Angel tier required to send messages" }, { status: 403 });
  }

  // Check if thread already exists (no need to count existing thread)
  const { data: existingThread } = await adminClient
    .from("threads")
    .select("id")
    .match({ startup_id: startupId, investor_id: investorId })
    .single();

  // Rate limit new threads against the plan's monthly message limit (null = unlimited)
  const messageLimit = getMessageLimit(ctx);
  if (!existingThread && messageLimit !== null) {
    try {
      const { success } = await messageRatelimit.limit(investorId);
      if (!success) {
        return NextResponse.json({
          error: `Monthly message limit reached (${messageLimit} threads). Upgrade to Pro for unlimited messaging.`,
        }, { status: 429 });
      }
    } catch {
      // Redis unavailable — fail open and allow the request through
    }
  }

  // Get or create thread
  let threadId: string;
  if (existingThread) {
    threadId = existingThread.id;
    await adminClient
      .from("threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);
  } else {
    const { data: newThread, error: threadError } = await adminClient
      .from("threads")
      .insert({ startup_id: startupId, investor_id: investorId, status: "active" })
      .select("id")
      .single();
    if (threadError || !newThread) {
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    }
    threadId = newThread.id;
  }

  // Insert message
  const { error: messageError } = await adminClient.from("messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    body: messageBody.trim(),
  });
  if (messageError) {
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }

  // Notify startup owner by email
  const { data: startup } = await adminClient
    .from("startups")
    .select("name, owner:profiles(email, full_name)")
    .eq("id", startupId)
    .single();

  const { data: senderProfile } = await adminClient
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  const startupOwnerEmail = (startup?.owner as any)?.email;
  if (startupOwnerEmail) {
    await sendNewMessageEmail(
      startupOwnerEmail,
      senderProfile?.full_name || "An investor",
      startup?.name || "your startup",
      messageBody
    ).catch(() => {});
  }

  return NextResponse.json({ success: true, threadId });
}
