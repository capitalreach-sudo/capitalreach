import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared admin authorisation for admin-only route handlers.
//
// The role is read with the service-role client rather than the caller's own
// session: an RLS misconfiguration on `profiles` must never be able to turn
// into a privilege escalation, and the caller cannot influence this read.

export interface AdminGuardOk {
  ok: true;
  adminId: string;
  admin: SupabaseClient;
}

export interface AdminGuardFail {
  ok: false;
  response: NextResponse;
}

export type AdminGuardResult = AdminGuardOk | AdminGuardFail;

export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, suspended, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  // A suspended admin is still suspended.
  if (profile.suspended || profile.account_status === "suspended" || profile.account_status === "banned") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Account suspended" }, { status: 403 }),
    };
  }

  return { ok: true, adminId: user.id, admin };
}

/** Writes an entry to the admin audit log. Never throws — logging must not
 *  break the action it is recording. */
export async function logAdminAction(
  admin: SupabaseClient,
  adminId: string,
  action: string,
  targetType: "startup" | "investor" | "profile" | "platform",
  targetId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("admin_actions").insert({
      admin_id:    adminId,
      action,
      target_type: targetType,
      target_id:   targetId,
      details:     details ?? null,
    });
  } catch (err) {
    console.error("[admin-guard] Failed to write audit log entry:", err);
  }
}
