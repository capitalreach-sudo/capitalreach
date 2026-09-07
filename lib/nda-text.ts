import { NON_CIRCUMVENTION_MONTHS } from "@/lib/circumvention-text";

/**
 * The confidentiality undertaking an investor agrees to before a founder's
 * NDA-gated data room opens. This is a click-through (clickwrap) agreement:
 * the investor reads these terms and accepts, which is a recognised way to
 * form a binding confidentiality obligation online. Founders who want a
 * formally counter-signed envelope can still use DocuSign on top; this is the
 * default path so the room actually opens without external configuration.
 *
 * An NDA whose exact wording cannot be produced later, against a party who is
 * not named, is a promise rather than a contract. So three things hold this
 * document together, and none of them can be dropped:
 *
 *   - the parties are NAMED in the text itself, not merely implied by the
 *     session that clicked;
 *   - the exact bytes are hashed (lib/nda-record.ts) and the hash is stored
 *     with the acceptance, so the version cannot be quietly reinterpreted;
 *   - what was actually disclosed under it is logged (nda_disclosures), and
 *     clause 8 tells the Recipient so before they agree, which is what makes
 *     that log usable as evidence rather than a surprise.
 *
 * Bump NDA_VERSION whenever the wording changes. Every acceptance records the
 * version AND the hash it agreed to, so an old acceptance is never silently
 * reinterpreted under new terms.
 */
export const NDA_VERSION = "2026-09-07";

/**
 * How long the confidentiality obligations run from acceptance. Exported
 * because nda_records.obligations_end_at is computed from it: the stored date
 * and the sentence in clause 6 must never be able to disagree.
 */
export const CONFIDENTIALITY_MONTHS = 24;

/** The party receiving the information, as far as the platform has verified it. */
export interface NdaRecipient {
  /** The recipient's own verified name. */
  name?: string | null;
  /** The firm, fund, or company they act for, where there is one. */
  entity?: string | null;
}

/**
 * How the recipient is described in the document. An unnamed recipient is not
 * an anonymous one: the account that accepts is recorded alongside the text,
 * and the fallback says so in the document rather than leaving a blank.
 */
function recipientLine(recipient?: NdaRecipient | null): string {
  const name = recipient?.name?.trim() || "";
  const entity = recipient?.entity?.trim() || "";
  if (name && entity) return `${name}, acting for ${entity}`;
  if (name) return name;
  if (entity) return entity;
  return "the account holder accepting this undertaking. Their verified name, the entity they act for, and their account identifier are recorded with this acceptance and form part of it";
}

/**
 * Renders the agreement for a specific company and, where known, a specific
 * recipient. The recipient is optional so a listing page can show the terms to
 * a visitor before there is anything to name, but the copy that is HASHED and
 * stored at acceptance must always be rendered with the named recipient.
 */
export function ndaText(companyName: string, recipient?: NdaRecipient | null): string {
  const company = companyName?.trim() || "the Company";
  return `MUTUAL CONFIDENTIALITY UNDERTAKING

Disclosing party ("the Company"): ${company}
Receiving party ("the Recipient"): ${recipientLine(recipient)}

In consideration of the Company granting the Recipient access to confidential
materials in connection with a potential investment, the Recipient agrees:

1. CONFIDENTIAL INFORMATION. "Confidential Information" means all non-public
   information the Company makes available through CapitalReach, in any form,
   whether written, spoken, or shown on screen. It includes the data room,
   financials, metrics, documents, cap table, customers, team, the idea and
   the business plan behind the company, and the fact and the contents of any
   discussions, whether marked confidential or not.

2. USE. The Recipient will use the Confidential Information solely to evaluate
   a possible investment in the Company, and for no other purpose.

3. NON-DISCLOSURE. The Recipient will not disclose the Confidential
   Information to any third party without the Company's prior written consent,
   and will protect it with at least the care it uses for its own confidential
   information. This clause protects the idea and the business plan themselves,
   not only the documents that describe them. In particular the Recipient will
   not:

   (a) share the Confidential Information with anyone other than its own staff
       and professional advisers who need it for the evaluation in clause 2 and
       who are bound to keep it confidential. The Recipient stays responsible
       for what those people do with it;

   (b) make copies, notes, summaries, models, or any other work derived from
       the Confidential Information beyond what that evaluation requires. Any
       that are made are Confidential Information on the same terms as the
       original, and are returned or destroyed on request;

   (c) use the Confidential Information to build, operate, fund, or advise a
       business that competes with the Company, or to help anyone else do so.

   Clause 3(c) does not stop the Recipient from backing other businesses it
   reaches independently. It stops the Recipient from using what it learned
   here to do it.

4. NON-CIRCUMVENTION. CapitalReach made this introduction. For ${NON_CIRCUMVENTION_MONTHS} months
   from the date of introduction (the first contact between the parties, as
   recorded by the platform), the Recipient will not deal with the Company
   outside CapitalReach in a way that avoids the platform's role in that
   introduction or the fee that role carries, whether directly or through
   anybody else.

   This obligation does not depend on the deal going ahead: it survives the
   Recipient declining the opportunity, and it survives the Recipient leaving
   the platform. It binds any fund, vehicle, syndicate, or company that the
   Recipient controls, manages, or advises, and it covers passing the Company
   on to a third party who then invests. It sits alongside CapitalReach's
   Terms of Service and does not replace them.

5. EXCLUSIONS. This undertaking does not cover information that is or becomes
   public through no fault of the Recipient, was already lawfully known to the
   Recipient, or is independently developed without use of the Confidential
   Information. Where disclosure is required by law, a court, or a regulator,
   the Recipient may disclose only what is required, and will tell the Company
   first wherever it is lawful to do so.

6. TERM. These obligations continue for ${CONFIDENTIALITY_MONTHS} months from the date of
   acceptance. The non-circumvention obligation in clause 4 runs for its own
   period from the date of introduction, which may end later.

7. NO LICENCE. Nothing here grants the Recipient any rights in the
   Confidential Information beyond the limited evaluation use above.

8. RECORD OF ACCESS. CapitalReach keeps a log of what the Recipient is shown
   under this undertaking: each document, figure, or data room item opened,
   when it was opened, and the address and browser it was opened from. The
   Recipient agrees that this log is an accurate record of what the Recipient
   received, and that it may be produced as evidence of that in any dispute
   about this undertaking. The exact text above is stored with the acceptance
   together with its version and a SHA-256 hash of the text, so what was agreed
   can be proved later.

By accepting, the Recipient confirms they have read and agree to these terms,
and that the identity recorded with this acceptance is their own.`;
}
