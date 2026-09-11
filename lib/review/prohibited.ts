/**
 * What we will not list, and why each one.
 *
 * The reason is not decoration. A reviewer refusing a listing has to tell the
 * founder something they can act on or argue with, and a bare category name
 * ("weapons") invites the wrong argument every time, because the founder reads
 * it as a slur on their business rather than as a rule about ours. The reason
 * is also what tells a reviewer where the edge of an entry is: most of these
 * are bans on a SPECIFIC activity, not on a sector, and the difference decides
 * a real case about once a week.
 *
 * This list is read by the `prohibited` item on the review checklist, and what
 * that item claims to a viewer is exactly what happens here: somebody reads
 * the listing against this list. It is not an investigation into what the
 * company does when nobody is reading.
 *
 * Nothing here refuses anything on its own. It is the reference a human
 * refuses against, and the refusal goes in the review record with its reason.
 */

export type ProhibitedKind = "sector" | "content";

export interface ProhibitedEntry {
  readonly key: string;
  /** What a reviewer calls it. */
  readonly label: string;
  /** Why we will not carry it, in the words a founder is owed. */
  readonly reason: string;
  /**
   * 'sector' is a judgement about what the company does. 'content' is a
   * judgement about what this listing SAYS, which a founder can usually fix in
   * an afternoon. Keeping them apart stops a fixable wording problem being
   * refused as though the business itself were out of scope.
   */
  readonly kind: ProhibitedKind;
}

export const PROHIBITED_ENTRIES: readonly ProhibitedEntry[] = [
  // ── What the company does ───────────────────────────────────────────────
  {
    key: "weapons",
    label: "Weapons, munitions and their components",
    reason:
      "Export control follows the goods across borders and does not care where the introduction was made. We are not in a position to run that screening on every investor a listing reaches, so we do not carry the sector. Dual-use software and materials are judged on the specific product, not on the customer.",
    kind: "sector",
  },
  {
    key: "adult",
    label: "Adult content and services",
    reason:
      "Our payment and banking partners refuse the category outright. A listing we cannot invoice against is a listing we cannot honestly accept.",
    kind: "sector",
  },
  {
    key: "gambling",
    label: "Gambling and betting operators",
    reason:
      "Licensing is per jurisdiction and per product, and an unlicensed operator raising money is raising it against an activity that may be stopped in a week. We do not have the standing to check a licence in every market an operator serves.",
    kind: "sector",
  },
  {
    key: "narcotics",
    label: "Controlled substances",
    reason:
      "Legal in some markets, criminal in others, with the investors on this platform spread across both. Licensed pharmaceutical work is not this entry.",
    kind: "sector",
  },
  {
    key: "unlicensed_financial",
    label: "Deposit taking, lending, insurance or payments without a licence",
    reason:
      "Taking the public's money for any of these is a licensed activity nearly everywhere. A company doing it without the licence is the single fastest way an investor on this platform loses everything, and we will not make the introduction. A licensed firm, or one operating under somebody else's licence as an agent, is not this entry, and should say which on the listing.",
    kind: "sector",
  },
  {
    key: "public_token",
    label: "Token or coin sales to the general public",
    reason:
      "A sale open to anyone who turns up is a public offer wearing different clothes, and it puts both the company and everyone introduced to it inside a regime neither of them registered for. Companies building infrastructure who are raising equity are not this entry.",
    kind: "sector",
  },
  {
    key: "high_cost_credit",
    label: "Payday and other high-cost short-term credit",
    reason:
      "Rate caps and affordability rules differ by market and the model depends on which one it operates under, so the same business is lawful on one side of a border and not the other. We are not equipped to tell which.",
    kind: "sector",
  },
  {
    key: "mlm",
    label: "Multi-level marketing and recruitment-driven revenue",
    reason:
      "Where the revenue comes from recruiting the next participant rather than from selling anything, the later participants pay for the earlier ones. Our fee would be charged on money raised for that.",
    kind: "sector",
  },
  {
    key: "shell",
    label: "Shell companies with no operations",
    reason:
      "An entity with no staff, no product and no trading history is not raising capital for a business, and we cannot tell what the money is for. Newly incorporated companies with a real team and a real product are not this entry.",
    kind: "sector",
  },
  {
    key: "sanctions",
    label: "Sanctioned parties, and companies controlled from sanctioned jurisdictions",
    reason:
      "Sanctions bind us directly and are not something a founder can consent their way out of. This covers ownership and control, not the nationality of any individual.",
    kind: "sector",
  },
  {
    key: "surveillance",
    label: "Surveillance and intrusion tooling sold to third parties",
    reason:
      "Software sold to read other people's devices or communications is the one product category where our introducing an investor could contribute directly to somebody being harmed. Defensive security, and testing tools sold to the owner of the system being tested, are not this entry.",
    kind: "sector",
  },
  {
    key: "data_brokerage",
    label: "Trade in personal data without the consent of the people in it",
    reason:
      "A business whose asset is a set of records the people in them never agreed to is a business whose asset can be ordered deleted. That is a risk we would be handing to an investor without being able to size it.",
    kind: "sector",
  },
  {
    key: "counterfeit",
    label: "Counterfeit goods and infringing distribution",
    reason:
      "The revenue depends on somebody else's rights not being enforced, which is not a business model an investor can be introduced to in good faith.",
    kind: "sector",
  },
  {
    key: "wildlife",
    label: "Protected wildlife and their products",
    reason:
      "Trade is restricted by treaty in most of the markets our members sit in, and enforcement runs against the buyer as well as the seller.",
    kind: "sector",
  },

  // ── What the listing says ───────────────────────────────────────────────
  {
    key: "guaranteed_returns",
    label: "Guaranteed, promised or projected returns",
    reason:
      "No early-stage company can guarantee a return, and a listing that says so is either mistaken or dishonest. A founder may describe their plan and their own forecasts, clearly labelled as forecasts. They may not offer anyone a number they will get back.",
    kind: "content",
  },
  {
    key: "endorsement",
    label: "Claims that CapitalReach endorses, verifies or recommends the company",
    reason:
      "We record what was checked and publish the gaps in it. A listing that turns that into an endorsement misrepresents the one thing this platform does say about it, and it is the claim we would have to answer for.",
    kind: "content",
  },
  {
    key: "public_offer",
    label: "Wording that addresses the general public rather than the members here",
    reason:
      "Everything on this platform is shown to members who have declared a category for themselves. A listing written as an appeal to anybody at all is describing a different kind of offer than the one being made.",
    // [LAWYER] Whether a given listing crosses from a private placement into a
    // regulated public offer is a legal determination and is not one this
    // codebase makes. No section number is cited here because we are not
    // certain of the right one in either Germany or the UK, and a wrong
    // citation is worse than none. The wording above deliberately describes
    // what the listing SAYS rather than asserting a legal conclusion about it.
    kind: "content",
  },
  {
    key: "third_party_names",
    label: "Named customers, investors or partners who have not agreed to be named",
    reason:
      "A name on a listing reads as an endorsement by the person named. Where they have not agreed, the founder is spending somebody else's reputation, and the complaint comes to us.",
    kind: "content",
  },
  {
    key: "personal_data",
    label: "Personal data of people who did not consent",
    reason:
      "Cap tables, customer lists and team documents regularly carry home addresses and identity numbers. Uploading them to a data room hands them to every investor who opens it, and that cannot be undone afterwards.",
    kind: "content",
  },
  {
    key: "forged_documents",
    label: "Altered or fabricated documents",
    reason:
      "A single altered document makes every other figure on the listing unusable, because there is no longer a basis for treating any of them as given in good faith.",
    kind: "content",
  },
];

export const PROHIBITED_SECTORS: readonly ProhibitedEntry[] =
  PROHIBITED_ENTRIES.filter((e) => e.kind === "sector");

export const PROHIBITED_CONTENT: readonly ProhibitedEntry[] =
  PROHIBITED_ENTRIES.filter((e) => e.kind === "content");

export function prohibitedEntry(key: unknown): ProhibitedEntry | null {
  if (typeof key !== "string") return null;
  return PROHIBITED_ENTRIES.find((e) => e.key === key) ?? null;
}

export function isProhibitedKey(v: unknown): boolean {
  return prohibitedEntry(v) !== null;
}
