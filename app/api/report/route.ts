import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUsers } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * E50: reporting content.
 *
 * Anyone can list anything here, and there was no way to say "this is a
 * scam", "this is not their company", "this message is abuse". The only
 * route was a support address the platform does not have yet. A marketplace
 * that charges for introductions has to have somewhere to send that.
 *
 * A report is private to the person who filed it: content_reports is
 * readable under RLS only by its reporter, so the subject of a report can
 * never read it or work out who filed it.
 */

const TARGETS = ["startup", "investor", "message", "question", "update"] as const;
const REASONS = ["spam", "misleading", "impersonation", "abuse", "not_raising", "other"] as const;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { targetType, targetId, reason, detail } = await req.json().catch(() => ({}));
  if (!TARGETS.includes(targetType)) return NextResponse.json({ error: "Unknown target" }, { status: 400 });
  if (!isUuid(targetId ?? "")) return NextResponse.json({ error: "targetId required" }, { status: 400 });
  if (!REASONS.includes(reason)) return NextResponse.json({ error: "Pick a reason" }, { status: 400 });
  const text = typeof detail === "string" && detail.trim() ? detail.trim().slice(0, 2000) : null;
  if (reason === "other" && !text) return NextResponse.json({ error: "Tell us what is wrong." }, { status: 400 });

  const admin = createAdminClient();

  // One open report per person per thing. Filing again does not add urgency,
  // it just buries the queue.
  const { data: existing } = await admin
    .from("content_reports")
    .select("id")
    .eq("reporter_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "open")
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "You have already reported this. We are looking at it." }, { status: 409 });

  const { error } = await admin.from("content_reports").insert({
    reporter_id: user.id, target_type: targetType, target_id: targetId, reason, detail: text,
  });
  if (error) return NextResponse.json({ error: "Could not file the report" }, { status: 500 });

  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").limit(20);
  const adminIds = (admins ?? []).map(a => a.id);
  if (adminIds.length) {
    await notifyUsers(adminIds, {
      type: "fee_due",
      title: `Content reported — ${reason.replace(/_/g, " ")}`,
      body: text ? text.slice(0, 140) : `A ${targetType} was reported.`,
      href: "/admin",
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
