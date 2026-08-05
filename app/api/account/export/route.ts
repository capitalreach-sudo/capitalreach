import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * GDPR-style data export: everything the platform holds about the signed-in
 * user, as a downloadable JSON document. Reads with the service role but
 * scopes every query to the caller's own identity -- the same set of rows
 * their session could reach one page at a time.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const [profile, startup, investor] = await Promise.all([
    admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    admin.from("startups").select("*").eq("owner_id", user.id).maybeSingle(),
    admin.from("investors").select("*").eq("owner_id", user.id).maybeSingle(),
  ]);

  const startupId = startup.data?.id ?? null;
  const investorId = investor.data?.id ?? null;

  const [deals, watchlist, targets, notifications, messages, questions] = await Promise.all([
    startupId || investorId
      ? admin.from("deals").select("*").or([
          startupId ? `startup_id.eq.${startupId}` : null,
          investorId ? `investor_id.eq.${investorId}` : null,
        ].filter(Boolean).join(","))
      : Promise.resolve({ data: [] }),
    investorId ? admin.from("watchlists").select("*").eq("investor_id", investorId) : Promise.resolve({ data: [] }),
    startupId ? admin.from("investor_targets").select("*").eq("startup_id", startupId) : Promise.resolve({ data: [] }),
    admin.from("notifications").select("*").eq("user_id", user.id).limit(1000),
    admin.from("messages").select("*").eq("sender_id", user.id).limit(2000),
    investorId ? admin.from("listing_questions").select("*").eq("investor_id", investorId) : Promise.resolve({ data: [] }),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profile.data ?? null,
    startup: startup.data ?? null,
    investor: investor.data ?? null,
    deals: deals.data ?? [],
    watchlist: watchlist.data ?? [],
    investor_targets: targets.data ?? [],
    notifications: notifications.data ?? [],
    sent_messages: messages.data ?? [],
    questions_asked: questions.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="capitalreach-export-${user.id.slice(0, 8)}.json"`,
    },
  });
}
