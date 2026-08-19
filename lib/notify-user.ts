import { createAdminClient } from "@/lib/supabase-server";

export type NotificationType =
  | "deal_opened"
  | "deal_stage"
  | "deal_closed"
  | "deal_passed"
  | "message"
  | "follow_up_due"
  | "contract_status"
  | "nda_signed"
  | "listing_approved"
  | "listing_rejected"
  // Added by migration 024. Keep this union in step with that CHECK
  // constraint: a value here that the constraint rejects fails the insert at
  // runtime, and notifyUser deliberately never throws, so it would vanish.
  | "team_added"
  // Added by migration 026.
  | "tier_changed"
  // Added by migration 027.
  | "search_match"
  // Added by migration 029.
  | "listing_saved"
  // Added by migration 030.
  | "listing_update"
  // Added by migration 036.
  | "doc_request"
  | "deal_shared"
  | "question_asked"
  | "question_answered"
  // Migration 049: an admin verified this investor.
  | "verified"
  // Migration 078: the platform is owed a success fee.
  | "fee_due";

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
}

/**
 * Raise an in-app notification.
 *
 * Always through the service role: notifications table has no INSERT policy for
 * `authenticated` on purpose, since a user writing their own notifications is
 * only useful for faking them.
 *
 * Never throws. A notification is a side effect of some real action -- a deal
 * closing, a message sending -- and failing to record it must not fail the
 * action that caused it. Callers can `await` this without a try/catch and know
 * the worst case is a missing bell entry.
 */
export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    const admin = createAdminClient();
    // Muting (migration 040) is enforced at the source, so every raiser --
    // routes, crons, bulk broadcasts that insert directly -- should prefer
    // notifyUser. A muted type is silently dropped for that user.
    const { data: prefs } = await admin
      .from("profiles")
      .select("muted_notification_types")
      .eq("id", input.userId)
      .maybeSingle();
    if (prefs?.muted_notification_types?.includes(input.type)) return;
    const { error } = await admin.from("notifications").insert({
      user_id: input.userId,
      type:    input.type,
      title:   input.title.slice(0, 200),
      body:    input.body ? input.body.slice(0, 500) : null,
      href:    input.href ?? null,
    });
    // supabase-js resolves with an { error } object rather than throwing, so
    // the catch below never saw a database failure. A rejected insert -- a
    // type outside the CHECK constraint, a missing table on a database that
    // has not run 022 -- disappeared without even a warning. Still not
    // rethrown, per the contract above; just no longer invisible.
    if (error) {
      console.warn(`[notify] insert rejected (type=${input.type}):`, error.message);
    }
  } catch (err) {
    console.warn("[notify] could not record notification:", err);
  }
}

/**
 * Same, for several recipients. Skips falsy ids and de-duplicates, so callers
 * can pass "both sides of a deal" without first working out whether one person
 * happens to be on both.
 */
export async function notifyUsers(
  userIds: Array<string | null | undefined>,
  input: Omit<NotifyInput, "userId">
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter((id): id is string => !!id)));
  await Promise.all(unique.map((userId) => notifyUser({ ...input, userId })));
}
