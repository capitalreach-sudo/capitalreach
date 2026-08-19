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
  level: AdminLevel;
}

export interface AdminGuardFail {
  ok: false;
  response: NextResponse;
}

export type AdminGuardResult = AdminGuardOk | AdminGuardFail;

export type AdminDenial = "unauthenticated" | "forbidden" | "suspended" | "insufficient";

/**
 * E51: `role = 'admin'` used to be all-or-nothing — anyone who could approve a
 * listing could also suspend every account and write off fees. Least
 * privilege first; each level includes the ones before it.
 *
 *   support  — read the platform, leave notes. Changes nothing.
 *   operator — the daily job: approve, reject, verify, suspend one account,
 *              work the fee ledger.
 *   owner    — the irreversible and the platform-wide: suspend everyone,
 *              grant tiers, end launch mode, change another admin's level.
 */
export type AdminLevel = "support" | "operator" | "owner";
const RANK: Record<AdminLevel, number> = { support: 1, operator: 2, owner: 3 };

export function atLeast(level: AdminLevel | null | undefined, required: AdminLevel): boolean {
  // An admin with no level recorded predates migration 082; that migration
  // set every existing admin to 'owner', so a null here is a row created
  // since, which starts at the bottom.
  return RANK[(level ?? "support") as AdminLevel] >= RANK[required];
}

export type AdminResolution =
  | { ok: true; adminId: string; admin: SupabaseClient; level: AdminLevel }
  | { ok: false; reason: AdminDenial };

/**
 * The shared check, without an HTTP shape. Server components need the same
 * decision but redirect instead of returning a 403.
 *
 * The service-role client is the point, not an implementation detail: there
 * are no admin RLS policies on this schema, so an admin reading platform data
 * through their own session sees only the rows they personally participate in
 * — which is to say, an empty platform. Every admin surface must read with
 * this client, and must therefore verify the role with it too.
 */
export async function resolveAdmin(required: AdminLevel = "support"): Promise<AdminResolution> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, suspended, account_status, admin_level")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") return { ok: false, reason: "forbidden" };
  // A suspended admin is still suspended.
  if (profile.suspended || profile.account_status === "suspended" || profile.account_status === "banned") {
    return { ok: false, reason: "suspended" };
  }
  const level = (profile.admin_level ?? "support") as AdminLevel;
  if (!atLeast(level, required)) return { ok: false, reason: "insufficient" };
  return { ok: true, adminId: user.id, admin, level };
}

export async function requireAdmin(required: AdminLevel = "support"): Promise<AdminGuardResult> {
  const resolved = await resolveAdmin(required);
  if (resolved.ok) return resolved;
  const status = resolved.reason === "unauthenticated" ? 401 : 403;
  const error =
    resolved.reason === "unauthenticated" ? "Unauthorized" :
    resolved.reason === "suspended" ? "Account suspended" :
    resolved.reason === "insufficient" ? `This needs ${required} access.` : "Forbidden";
  return { ok: false, response: NextResponse.json({ error }, { status }) };
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
