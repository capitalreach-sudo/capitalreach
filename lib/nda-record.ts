import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-server";
import { CONFIDENTIALITY_MONTHS, NDA_VERSION, type NdaRecipient } from "@/lib/nda-text";
import { effectiveTrustLevel } from "@/lib/trust";
import { openSignals, recordSignal } from "@/lib/trust-signals";

/**
 * What turns the NDA from a promise into a contract.
 *
 * Three artefacts, all written at or after acceptance:
 *
 *   text_sha256      the exact bytes agreed to. A version string alone proves
 *                    nothing: anyone can edit a file and keep the label.
 *   counterparty     who was bound, snapshotted at signing. The investor may
 *                    later rename their firm or lose their verification; the
 *                    contract was made against who they were that day.
 *   nda_disclosures  what was actually handed over. Without it a breach claim
 *                    has to argue about what the room even contained.
 *
 * nda_disclosures has RLS enabled with no permissive policy (migration 113),
 * so every write here is service-role and reachable only from server code that
 * has already established the caller is party to the record.
 */

// -- The hash -----------------------------------------------------------------

/** Hex SHA-256 of the exact agreement text. Stored on nda_records. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// -- The named party ----------------------------------------------------------

/** Just enough of the auth user to name them. */
export interface CounterpartyUser {
  id: string;
  full_name?: string | null;
}

/** Just enough of the investor row to name the entity they act for. */
export interface CounterpartyInvestor {
  id: string;
  display_name?: string | null;
  firm_name?: string | null;
  type?: string | null;
  trust_expires_at?: string | null;
}

/**
 * The jsonb written to nda_records.counterparty.
 *
 * A type alias rather than an interface on purpose: only aliases get an
 * implicit index signature, so this assigns straight into supabase-js's Json
 * column type without a cast at every call site.
 *
 * The email is deliberately absent. userId resolves to the current address at
 * any time, while a copied-out address is a stale personal-data duplicate the
 * deletion flow would then have to chase.
 */
export type CounterpartySnapshot = {
  /** The person's verified name, where the platform has one. */
  name: string | null;
  /** The firm, fund, or company they act for, where there is one. */
  entity: string | null;
  /** Trust level AT SIGNING. A later expiry does not rewrite what was agreed. */
  trustLevel: number;
  userId: string;
  investorId: string | null;
  ndaVersion: string;
  capturedAt: string;
};

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * Snapshot who is being bound.
 *
 * `trustLevel` runs through effectiveTrustLevel against the investor's expiry,
 * so a lapsed verification is recorded as the 0 it actually is. Claiming
 * "level 3 at signing" on the strength of an expired check would be the one
 * lie in a document whose whole job is being true later.
 */
export function buildCounterparty(
  user: CounterpartyUser,
  investor: CounterpartyInvestor | null | undefined,
  trustLevel: number | null | undefined,
): CounterpartySnapshot {
  const name = clean(user.full_name) ?? clean(investor?.display_name);
  const display = clean(investor?.display_name);
  const entity = clean(investor?.firm_name) ?? (display && display !== name ? display : null);
  return {
    name,
    entity,
    trustLevel: effectiveTrustLevel(trustLevel, investor?.trust_expires_at ?? null),
    userId: user.id,
    investorId: investor?.id ?? null,
    ndaVersion: NDA_VERSION,
    capturedAt: new Date().toISOString(),
  };
}

/** The snapshot as the NDA text wants it, so the document and the record name
 *  the same party rather than each deriving their own. */
export function recipientFrom(counterparty: CounterpartySnapshot): NdaRecipient {
  return { name: counterparty.name, entity: counterparty.entity };
}

// -- The term -----------------------------------------------------------------

/**
 * When the confidentiality obligations lapse, from clause 6. Derived from the
 * same constant the clause interpolates, so the stored date can never say
 * something the signed text does not.
 */
export function obligationsEnd(signedAt: Date | string = new Date()): string {
  const at = signedAt instanceof Date ? new Date(signedAt.getTime()) : new Date(signedAt);
  const base = Number.isNaN(at.getTime()) ? new Date() : at;
  base.setMonth(base.getMonth() + CONFIDENTIALITY_MONTHS);
  return base.toISOString();
}

// -- Finding the record -------------------------------------------------------

export interface NdaRecordRef {
  id: string;
  signedAt: string | null;
  version: string | null;
  textSha256: string | null;
  obligationsEndAt: string | null;
  counterparty: CounterpartySnapshot | null;
  /** Signed, and the term has not run out. What a disclosure hangs off. */
  live: boolean;
}

/**
 * The NDA record for one startup/investor pair, if there is one.
 *
 * Returns the row even when it is unsigned or expired rather than null, so a
 * caller can tell "never signed" from "signed, term ended" -- those are
 * different facts about a disclosure and the log should not flatten them.
 */
export async function ndaRecordFor(
  startupId: string,
  investorId: string,
): Promise<NdaRecordRef | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("nda_records")
      .select("id, signed_at, nda_version, text_sha256, obligations_end_at, counterparty")
      .match({ startup_id: startupId, investor_id: investorId })
      .maybeSingle();
    if (!data) return null;
    const ended = !!data.obligations_end_at && new Date(data.obligations_end_at).getTime() < Date.now();
    return {
      id: data.id,
      signedAt: data.signed_at,
      version: data.nda_version,
      textSha256: data.text_sha256,
      obligationsEndAt: data.obligations_end_at,
      counterparty: (data.counterparty as CounterpartySnapshot | null) ?? null,
      live: !!data.signed_at && !ended,
    };
  } catch {
    return null;
  }
}

// -- The disclosure log -------------------------------------------------------

/**
 * The item kinds the log accepts. This is not a convention: nda_disclosures
 * .item_type carries a CHECK constraint (migration 113) listing exactly these
 * seven values, and recordDisclosure swallows insert errors by design, so a
 * name outside this list is not logged loosely -- it is not logged at all, and
 * the caller is told nothing. A new surface needs a migration first.
 */
export const DISCLOSURE_ITEM_TYPES = [
  "data_room_open", "document", "financials", "metrics", "deck", "update", "message_thread",
] as const;
export type DisclosureItemType = (typeof DISCLOSURE_ITEM_TYPES)[number];

export interface DisclosureInput {
  /** Skip it and the live record for the pair is looked up. */
  ndaRecordId?: string | null;
  startupId: string;
  investorId: string;
  itemType: DisclosureItemType | string;
  itemId?: string | null;
  itemLabel?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Machine-speed hoovering of a room, rather than a person reading it. */
const BULK_ITEMS = 25;
const BULK_WINDOW_MINUTES = 15;

/**
 * Log one thing that was shown to an investor under an NDA.
 *
 * Never throws, for the same reason recordSignal does not: this is a side
 * effect of a real action (a document opening, a figure rendering), and losing
 * the note must not fail the action. Call it AFTER authorisation has passed
 * and the thing is actually being handed over, never before -- a log of what
 * somebody tried to open is a different claim than a log of what they got.
 *
 * A null nda_record_id is meaningful, not a failure: it records that the item
 * was received with no NDA in force, which is itself evidence.
 */
export async function recordDisclosure(input: DisclosureInput): Promise<void> {
  try {
    const admin = createAdminClient();

    let ndaRecordId = input.ndaRecordId ?? null;
    if (!ndaRecordId) {
      const record = await ndaRecordFor(input.startupId, input.investorId);
      // `live`, not merely signed: an item handed over after the term in
      // clause 6 ran out was not received under that undertaking, and hanging
      // it off the record anyway would overstate what the NDA covers.
      ndaRecordId = record?.live ? record.id : null;
    }

    const { error } = await admin.from("nda_disclosures").insert({
      nda_record_id: ndaRecordId,
      startup_id: input.startupId,
      investor_id: input.investorId,
      item_type: input.itemType,
      item_id: input.itemId ?? null,
      item_label: input.itemLabel?.slice(0, 300) ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent?.slice(0, 400) ?? null,
    });
    if (error) {
      console.warn("[nda-record] disclosure insert rejected:", error.message);
      return;
    }

    await flagBulkAccess(input.investorId, input.startupId);
  } catch (err) {
    console.warn("[nda-record] could not log disclosure:", err);
  }
}

/**
 * The whole point of counting: an investor reading a room opens a dozen things
 * over an afternoon, a scraper takes the lot in a minute. Raised as a signal
 * for a human to look at, never as a block -- a thorough diligence process
 * genuinely does open everything.
 */
async function flagBulkAccess(investorId: string, startupId: string): Promise<void> {
  const since = new Date(Date.now() - BULK_WINDOW_MINUTES * 60_000).toISOString();
  const admin = createAdminClient();
  const { count } = await admin
    .from("nda_disclosures")
    .select("id", { count: "exact", head: true })
    .eq("investor_id", investorId)
    .eq("startup_id", startupId)
    .gte("occurred_at", since);
  if ((count ?? 0) < BULK_ITEMS) return;

  // One standing signal is enough. Re-raising it on every further open would
  // bury the queue in copies of a finding a reviewer has already read.
  const standing = await openSignals("investor", investorId);
  if (standing.some((f) => f.signal === "nda_bulk_download")) return;

  await recordSignal("investor", investorId, "nda_bulk_download", "medium", {
    startup_id: startupId,
    items: count,
    window_minutes: BULK_WINDOW_MINUTES,
  });
}
