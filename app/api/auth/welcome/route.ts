import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/resend";
import { getLaunchStatus, incrementMemberCount } from "@/lib/launchMode";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role, created_at")
      .eq("id", user.id)
      .single();

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Increment launch member count if this is a fresh signup (within 5 min)
    const { isLaunch } = await getLaunchStatus();
    if (isLaunch && profile.created_at) {
      const ageMs = Date.now() - new Date(profile.created_at).getTime();
      if (ageMs < 5 * 60 * 1000) {
        await incrementMemberCount().catch(() => {});
      }
    }

    await sendWelcomeEmail(user.email!, profile.full_name || "", profile.role);
    return NextResponse.json({ success: true });
  } catch {
    // Non-critical — don't surface email failures to the user
    return NextResponse.json({ success: true });
  }
}
