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
  | "listing_rejected";

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
    await admin.from("notifications").insert({
      user_id: input.userId,
      type:    input.type,
      title:   input.title.slice(0, 200),
      body:    input.body ? input.body.slice(0, 500) : null,
      href:    input.href ?? null,
    });
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
