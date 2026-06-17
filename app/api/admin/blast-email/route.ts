import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resend } from "@/lib/resend";

// Admin: blast email about a specific startup to all matching investors
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { startupId, subject, customMessage } = await req.json();
  const adminClient = createAdminClient();

  const { data: startup } = await adminClient
    .from("startups")
    .select("name, tagline, slug, industry, stage")
    .eq("id", startupId)
    .single();

  if (!startup) return NextResponse.json({ error: "Startup not found" }, { status: 404 });

  // Get investors matching startup industry/stage with paid tiers
  const { data: investors } = await adminClient
    .from("investors")
    .select("id, industries, stages, owner:profiles(email)")
    .in("subscription_tier", ["angel", "pro_investor", "institutional"]);

  const matchingInvestors = (investors || []).filter(inv => {
    const industries = inv.industries || [];
    const stages = inv.stages || [];
    const industryMatch = industries.length === 0 || industries.includes(startup.industry);
    const stageMatch = stages.length === 0 || stages.includes(startup.stage);
    return industryMatch && stageMatch;
  });

  const emails = matchingInvestors
    .map(inv => (inv.owner as any)?.email)
    .filter(Boolean);

  if (emails.length === 0) {
    return NextResponse.json({ sent: 0, message: "No matching investors found" });
  }

  // Send in batches of 50 (Resend limit)
  const BATCH_SIZE = 50;
  let sentCount = 0;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const emailBody = `
      <h2>${customMessage || `New startup on CapitalReach: ${startup.name}`}</h2>
      <p><strong>${startup.name}</strong> — ${startup.tagline}</p>
      <p><strong>Industry:</strong> ${startup.industry} &nbsp; <strong>Stage:</strong> ${startup.stage}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/startups/${startup.slug}"
         style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px">
        View Profile →
      </a></p>
      <p style="font-size:12px;color:#999;margin-top:24px">
        You're receiving this because you're a CapitalReach investor member.
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/investor/settings">Manage email preferences</a>
      </p>
    `;

    await Promise.all(
      batch.map(email =>
        resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "noreply@capitalreach.com",
          to: email,
          subject: subject || `[CapitalReach] New startup: ${startup.name}`,
          html: emailBody,
        }).catch(() => {})
      )
    );
    sentCount += batch.length;
  }

  return NextResponse.json({ sent: sentCount });
}
