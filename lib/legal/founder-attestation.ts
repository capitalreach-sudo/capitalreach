import { sha256 } from "@/lib/nda-record";

/**
 * The founder's statement about their own listing.
 *
 * The review ledger records what WE checked, and every method string on it
 * says how little that is: figures are read for internal consistency and
 * nothing more. This is the other half. The person who put the numbers there
 * says, in their own name, that they are true, and the record of them saying
 * it is what stands behind every figure we decline to audit.
 *
 * Why a hash and not a ticked box. A version string proves nothing if the
 * wording can be edited without a bump, and the party we would produce this
 * against is the party who signed it. So the document is RENDERED rather than
 * stored, hashed over its exact bytes, and the hash is written beside the
 * timestamp -- the same construction as deal_seals.seal_sha256 (120) and
 * nda_records.text_sha256 (113), for the same reason.
 *
 * Migration 126 puts all four columns behind startups_attestation_server_only:
 * the founder attests THROUGH the route that renders this text and hashes what
 * it rendered. A timestamp and a hash the attesting party can write themselves
 * are not evidence of anything.
 *
 * Bump FOUNDER_ATTESTATION_VERSION whenever the wording changes. Every
 * signature stamps the version and the hash in force when it was made, so an
 * older attestation is never reinterpreted under newer words.
 */
export const FOUNDER_ATTESTATION_VERSION = "2026-09-11";

/**
 * How long a founder has to correct a figure that goes stale. Exported because
 * the sentence in the statement interpolates it: a window quoted anywhere else
 * in the product must read this rather than restate it, or the two can
 * disagree about a deadline somebody is held to.
 */
export const ATTESTATION_CORRECTION_DAYS = 14;

export interface AttestationSubject {
  /**
   * startups.legal_entity_name (125). ADMIN-ONLY EVERYWHERE ELSE: 109 keeps it
   * out of the client-key column grant because an entity name beside a
   * register number finds the founders and the shareholders in a minute. It
   * appears here because the document has to name the party being represented,
   * and this text is rendered to exactly two audiences: the founder, about
   * their own company, and an admin. It must never reach an investor.
   */
  legalEntityName?: string | null;
  /** The trading name, used only when no legal entity is on file. */
  displayName?: string | null;
}

/**
 * How the company is named in the statement. A blank would let a founder
 * attest to representing nothing at all, so the fallback names what the
 * listing is instead of leaving the sentence open.
 */
function entityLine(subject: AttestationSubject): string {
  const legal = subject.legalEntityName?.trim();
  if (legal) return legal;
  const display = subject.displayName?.trim();
  if (display) return `${display}, the company described in this listing`;
  return "the company described in this listing";
}

/**
 * The document of record.
 *
 * Rendered on every request rather than stored between them, so the bytes the
 * founder reads and the bytes that get hashed are produced by one function.
 * Line breaks are part of those bytes: rewrapping this paragraph changes the
 * hash, which is a version bump, not a formatting change.
 */
export function founderAttestationText(subject: AttestationSubject): string {
  return `FOUNDER ATTESTATION

I confirm that the information in this listing is true, complete, and not
misleading to the best of my knowledge; that I am authorised to represent
${entityLine(subject)}; and that I will correct any figure that becomes
inaccurate within ${ATTESTATION_CORRECTION_DAYS} days. I understand that CapitalReach relies on this
statement, does not audit my figures, and that a knowingly false statement
is a breach of the Terms and may be unlawful.

Signed below. The signature records the name typed, the time, the network
address it came from, and the hash of this exact document.`;
}

export function attestationHash(text: string): string {
  return sha256(text);
}

/** What the four guarded columns on `startups` hold, read back together. */
export interface AttestationState {
  attestedAt: string | null;
  version: string | null;
  sha256: string | null;
  /**
   * Signed, and signed against the wording now in force. A founder who
   * attested under an older version has attested to something else, which the
   * checklist's `attestation` item is written to notice.
   */
  current: boolean;
}

export function attestationStateFrom(row: {
  founder_attestation_at?: string | null;
  founder_attestation_version?: string | null;
  founder_attestation_sha256?: string | null;
} | null | undefined): AttestationState {
  const attestedAt = row?.founder_attestation_at ?? null;
  const version = row?.founder_attestation_version ?? null;
  return {
    attestedAt,
    version,
    sha256: row?.founder_attestation_sha256 ?? null,
    current: !!attestedAt && version === FOUNDER_ATTESTATION_VERSION,
  };
}
