/**
 * The confidentiality undertaking an investor agrees to before a founder's
 * NDA-gated data room opens. This is a click-through (clickwrap) agreement —
 * the investor reads these terms and accepts, which is a recognised way to
 * form a binding confidentiality obligation online. Founders who want a
 * formally counter-signed envelope can still use DocuSign on top; this is the
 * default path so the room actually opens without external configuration.
 *
 * Bump NDA_VERSION whenever the wording changes — every acceptance records the
 * version it agreed to, so an old acceptance is never silently reinterpreted
 * under new terms.
 */
export const NDA_VERSION = "2026-08-15";

/** Renders the agreement for a specific company. */
export function ndaText(companyName: string): string {
  const company = companyName?.trim() || "the Company";
  return `MUTUAL CONFIDENTIALITY UNDERTAKING

In consideration of ${company} ("the Company") granting access to confidential
materials in connection with a potential investment, the accepting party
("the Recipient") agrees:

1. CONFIDENTIAL INFORMATION. "Confidential Information" means all non-public
   information the Company makes available through CapitalReach — including its
   data room, financials, metrics, documents, and the fact and contents of any
   discussions — whether marked confidential or not.

2. USE. The Recipient will use the Confidential Information solely to evaluate a
   possible investment in the Company, and for no other purpose.

3. NON-DISCLOSURE. The Recipient will not disclose the Confidential Information
   to any third party without the Company's prior written consent, and will
   protect it with at least the care it uses for its own confidential
   information.

4. NON-CIRCUMVENTION. The Recipient will not use the Confidential Information to
   circumvent CapitalReach's role in the introduction, consistent with the
   platform's Terms of Service.

5. EXCLUSIONS. This undertaking does not cover information that is or becomes
   public through no fault of the Recipient, was already lawfully known to the
   Recipient, or is independently developed without use of the Confidential
   Information.

6. TERM. These obligations continue for two (2) years from the date of
   acceptance.

7. NO LICENCE. Nothing here grants the Recipient any rights in the Confidential
   Information beyond the limited evaluation use above.

By accepting, the Recipient confirms they have read and agree to these terms.`;
}
