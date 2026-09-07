import Stripe from "stripe";

/**
 * Identity verification: a government document matched to a live face.
 *
 * This is the check that cannot be built in-house and cannot be faked by a
 * reviewer squinting at an upload. Without it, "verified human" means "someone
 * typed a name into a form" -- so every rung above it on the trust ladder is
 * decoration. Stripe Identity is the shortest path here because Stripe is
 * already in the stack for payments: no new vendor contract, no new PCI-ish
 * surface, one env var.
 *
 * WHAT THE PLATFORM STORES: the session id and the pass/fail outcome. Never
 * the document, never the selfie, never the extracted document number. Stripe
 * holds those under their own retention policy, which is precisely the point
 * -- the moment a passport scan lands in our bucket we have inherited a GDPR
 * obligation we did not need.
 */

export const KYC_CONFIGURED = !!process.env.STRIPE_SECRET_KEY;

function client(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
}

export interface KycSession {
  /** Stripe's id for the session. Stored as verification_evidence.vendor_ref. */
  id: string;
  /** Where to send the applicant. Single-use, short-lived, hosted by Stripe. */
  url: string;
}

/**
 * Open a verification session for one applicant.
 *
 * `caseId` rides along in metadata so the webhook can find its way back to the
 * evidence row without us keeping a second mapping table.
 */
export async function createKycSession(opts: {
  caseId: string;
  userId: string;
  returnUrl: string;
}): Promise<KycSession | null> {
  const stripe = client();
  if (!stripe) return null;

  const session = await stripe.identity.verificationSessions.create({
    type: "document",
    // Liveness: a document alone is a photograph of a stolen passport. The
    // selfie match is what ties the document to the person holding it.
    options: { document: { require_live_capture: true, require_matching_selfie: true } },
    metadata: { case_id: opts.caseId, user_id: opts.userId },
    return_url: opts.returnUrl,
  });

  return session.url ? { id: session.id, url: session.url } : null;
}

export type KycOutcome = "verified" | "requires_input" | "processing" | "canceled" | "unknown";

export interface KycResult {
  outcome: KycOutcome;
  /** Stripe's reason when a check fails, safe to show a reviewer. */
  reason: string | null;
  /** Non-identifying summary for the evidence row's detail column. */
  detail: Record<string, unknown>;
}

/**
 * Read a session's outcome. Called by the webhook and by the review bench when
 * a reviewer opens a case, so a stalled webhook never leaves a case stuck.
 */
export async function readKycSession(sessionId: string): Promise<KycResult | null> {
  const stripe = client();
  if (!stripe) return null;

  const s = await stripe.identity.verificationSessions.retrieve(sessionId);
  const outcome: KycOutcome =
    s.status === "verified" ? "verified"
    : s.status === "requires_input" ? "requires_input"
    : s.status === "processing" ? "processing"
    : s.status === "canceled" ? "canceled"
    : "unknown";

  return {
    outcome,
    reason: s.last_error?.reason ?? null,
    // Deliberately shallow: enough for an auditor to see WHAT was checked and
    // when, with nothing that would identify the person if this row leaked.
    detail: {
      status: s.status,
      type: s.type,
      livenessRequired: true,
      checkedAt: new Date().toISOString(),
    },
  };
}

/**
 * Whether an identity check may stand on its own. A session that verified but
 * whose selfie was not matched is not an identity check -- it is a document
 * scan, and the ladder's level 2 explicitly claims more than that.
 */
export function kycSatisfiesLevel2(result: KycResult): boolean {
  return result.outcome === "verified";
}
