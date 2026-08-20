import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUser } from "@/lib/notify-user";
import { buildAccessContext, founderCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import { isUuid } from "@/lib/utils";

/**
 * Record that the signed-in investor opened a document (migration 039).
 * Fire-and-forget from the client; RLS's WITH CHECK pins investor_id to the
 * caller's own entity, so nobody can log views as someone else. Non-investors
 * simply record nothing.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ tracked: false });

  const { documentId } = await req.json().catch(() => ({}));
  if (!isUuid(documentId)) return NextResponse.json({ error: "documentId required" }, { status: 400 });

  const { data: inv } = await supabase.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!inv) return NextResponse.json({ tracked: false });

  const { error } = await supabase.from("document_views").insert({ document_id: documentId, investor_id: inv.id });
  if (!error) await alertFounder(documentId, inv.id);
  return NextResponse.json({ tracked: !error });
}

/**
 * Tell the founder their deck was opened.
 *
 * The opens have been recorded since migration 039 and surfaced on the
 * dashboard — but only to a founder who thought to go and look. The signal a
 * founder actually wants is the one that arrives while the memory of the
 * meeting is fresh: the investor you pitched on Tuesday just opened the deck.
 * That is the difference between an analytics panel and a reason to follow up.
 *
 * Once per investor per document per day. An investor scrolling back and forth
 * through a deck is one reading, and a founder who gets nine notifications for
 * it turns notifications off.
 *
 * Never throws: failing to send the nudge must not fail the tracking call that
 * the viewer is waiting on.
 */
async function alertFounder(documentId: string, investorId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: doc } = await admin
      .from("startup_documents")
      .select("id, label, startup:startups(id, name, owner_id, subscription_tier)")
      .eq("id", documentId)
      .maybeSingle();
    const startup = doc?.startup as unknown as { name: string; owner_id: string; subscription_tier: string | null } | null;
    if (!startup?.owner_id) return;

    // Was this pair already counted today? The row just inserted is in this
    // count, so a first read of the day is 1 and anything above it is the same
    // person still reading.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("document_views")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .eq("investor_id", investorId)
      .gte("viewed_at", since);
    if ((count ?? 0) > 1) return;

    // Who it was is a paid signal, exactly as it is on the dashboard and in
    // the deal cards. Free plans get told it happened, not by whom — the same
    // line the rest of the product draws, so the notification cannot become a
    // way around the paywall.
    const { isLaunch } = await getLaunchStatus();
    const ctx = buildAccessContext(
      { id: startup.owner_id, role: "startup", subscription_tier: startup.subscription_tier },
      isLaunch,
    );
    const named = founderCan(ctx).seeInvestorIdentity;

    let who: string | null = null;
    if (named) {
      const { data: inv } = await admin
        .from("investors").select("display_name, firm_name").eq("id", investorId).maybeSingle();
      who = inv?.firm_name || inv?.display_name || null;
    }

    await notifyUser({
      userId: startup.owner_id,
      type: "listing_update",
      title: who ? `${who} opened ${doc?.label ?? "a document"}` : `An investor opened ${doc?.label ?? "a document"}`,
      body: "Worth a follow-up while it is front of mind.",
      href: "/dashboard/startup",
    });
  } catch (err) {
    console.error("[documents/track] alert failed:", err);
  }
}
