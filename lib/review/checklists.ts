/**
 * What a review actually covers, written down so it can be shown.
 *
 * A badge that says "reviewed" is the claim this file exists to replace. The
 * defence against "you said you checked" is not a stronger word, it is the
 * list: these items, from this version of the list, with this outcome each,
 * and the GAPS left in. An item that was not done is information, and 126's
 * header says why it stays in the record rather than being dropped.
 *
 * `method` is SHOWN TO THE VIEWER. It is not an internal note. Every sentence
 * in one is written to be read by an investor deciding how much weight to put
 * on our having looked, so it says what was actually opened and, more
 * importantly, what was not. A method that reads better than the check it
 * describes is the failure mode here.
 *
 * IMMUTABLE, per version. Once a version string has been stamped on a stored
 * review, the items under it may never be edited: review_checklists rows carry
 * only the version, and a reader a year from now resolves the wording through
 * it. Wording changes and item changes both mean a NEW version added
 * alongside, the same rule as DEAL_SEAL_VERSION and NDA_VERSION.
 */

export type ReviewSubjectType = "startup" | "investor";

/**
 * What a reviewer may record against one item.
 *
 * 'na' is a real answer, not a skip: a pre-revenue company has no figures to
 * be consistent and an angel has no firm to look up. Collapsing it into 'fail'
 * would publish a finding about the subject where there was none, and
 * collapsing it into 'pass' would publish a check that never happened.
 */
export const ITEM_OUTCOMES = ["pass", "fail", "na"] as const;
export type ItemOutcome = (typeof ITEM_OUTCOMES)[number];

export const REVIEW_OUTCOMES = ["approved", "rejected", "changes_requested"] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export interface ChecklistItem {
  readonly key: string;
  readonly label: string;
  readonly method: string;
  /**
   * Required items must be 'pass' before a subject may be approved. The set is
   * deliberately small, and holds only items a reviewer can always answer: an
   * item that is honestly 'na' some of the time cannot be required, because a
   * gate a reviewer cannot satisfy truthfully is a gate that teaches them to
   * tick it falsely.
   */
  readonly required: boolean;
}

export interface Checklist {
  readonly version: string;
  readonly subjectType: ReviewSubjectType;
  readonly items: readonly ChecklistItem[];
}

// ── The lists ────────────────────────────────────────────────────────────────

export const STARTUP_CHECKLIST_V1: Checklist = {
  version: "startup-v1",
  subjectType: "startup",
  items: [
    {
      key: "identity",
      label: "Company identity",
      method:
        "We compared the legal entity name and registration number the founder gave us against the entry in the public company register. That is a register page, read by a person. We did not visit the company, meet anyone, or look at anything the register does not hold.",
      required: true,
    },
    {
      key: "authority",
      label: "Authority of the person who listed the company",
      method:
        "We checked that the account holder who created this listing is named as a director, officer or shareholder in the same public filing. Where the register does not name them, this item is recorded as not passed and is shown to you that way.",
      required: true,
    },
    {
      key: "figures",
      label: "Revenue, traction and financial figures",
      method:
        "We read the figures on the listing and checked them against each other: that monthly and annual revenue agree, that a growth rate matches the numbers it is drawn from, and that nothing contradicts the stage claimed. THIS IS NOT AN AUDIT. Every figure here is self-reported by the founder. We inspected no bank statement, no ledger, no accounting system and no invoice, and no figure on this listing has been independently confirmed by us or by anyone else.",
      required: false,
    },
    {
      key: "documents",
      label: "Documents in the data room",
      method:
        "We opened each uploaded document and confirmed it is the kind of document its title claims and that it can be read. We did not verify anything written inside one, and we did not confirm that a signature, a counterparty or a figure in a document is genuine.",
      required: false,
    },
    {
      key: "prohibited",
      label: "Prohibited sectors and content",
      method:
        "We read the listing against our prohibited list. This is a reading of what the listing says about itself. It is not an investigation into what the company actually does.",
      required: true,
    },
    {
      key: "web_presence",
      label: "Website and public presence",
      method:
        "We opened the website and the linked public profiles and confirmed they exist and describe the same company as this listing. We did not check who owns the domain or when it was registered.",
      required: false,
    },
    {
      key: "duplicate",
      label: "Duplicate or impersonated listing",
      method:
        "We searched our own listings for the same company name, website domain and registration number. This can only find a collision inside CapitalReach. A company being impersonated here for the first time will not be caught by it.",
      required: true,
    },
    {
      key: "contact",
      label: "A working route to a person",
      method:
        "We confirmed that mail sent to the account address is delivered and answered. We have not spoken to anyone by telephone and we have not met anyone.",
      required: false,
    },
    {
      key: "attestation",
      label: "Founder attestation on file",
      method:
        "We checked that the founder has signed the attestation confirming this listing is true, complete and not misleading, and that their signature covers the wording currently in force. That is a statement the founder made, not a finding we made.",
      required: true,
    },
  ],
};

export const INVESTOR_CHECKLIST_V1: Checklist = {
  version: "investor-v1",
  subjectType: "investor",
  items: [
    {
      key: "identity",
      label: "Identity of the account holder",
      method:
        "We checked a government identity document against the name on the account through our identity provider. What we relied on is that provider's check. Nobody here met the holder.",
      required: true,
    },
    {
      key: "entity",
      label: "The firm or fund named on the profile",
      method:
        "We checked that the firm or fund named exists in a public register, and that the account holder is connected to it in a public filing or on the firm's own site. We did not confirm their mandate, their remit, or their authority to commit anyone else's money.",
      required: false,
    },
    {
      key: "declaration",
      label: "Investor category declared",
      method:
        "We recorded the category the investor selected for themselves and the date they selected it. It is their declaration about themselves, not our assessment of them, and we asked for no evidence of it.",
      required: true,
    },
    {
      key: "capital",
      label: "Evidence of funds",
      method:
        "Where the investor supplied evidence of available capital, we read it and noted its date. We confirmed no balance with any bank, and we do not know whether the money is still there today.",
      required: false,
    },
    {
      key: "screening",
      label: "Sanctions and politically exposed persons",
      method:
        "We searched the name against the lists our screening provider covers. The coverage is the provider's, not ours: a list the provider does not hold is a list that was not searched, and a name spelled differently may not match at all.",
      required: true,
    },
    {
      key: "conduct",
      label: "Conduct recorded on this platform",
      method:
        "We read what this account's record here holds: earlier reports, circumvention strikes, and complaints. An account that is new here has no record to read, which is not the same as a clean one.",
      required: true,
    },
  ],
};

/**
 * Every version ever published, keyed by its version string, so a stored
 * review resolves its own wording. Retired versions stay here for as long as a
 * row references them, which in practice is forever.
 */
export const CHECKLISTS: readonly Checklist[] = [STARTUP_CHECKLIST_V1, INVESTOR_CHECKLIST_V1];

/** The list in force for new reviews of this subject type. */
export function currentChecklist(subjectType: ReviewSubjectType): Checklist {
  return subjectType === "investor" ? INVESTOR_CHECKLIST_V1 : STARTUP_CHECKLIST_V1;
}

/**
 * The only supported way to stamp review_checklists.checklist_version.
 *
 * A caller that writes the string itself pins a review to whatever version was
 * current when that line was typed, and the mismatch is undetectable: the row
 * reads back cleanly, against the wrong list.
 */
export function currentChecklistVersion(subjectType: ReviewSubjectType): string {
  return currentChecklist(subjectType).version;
}

/** Null for a version this build no longer carries, which a reader must handle
 *  rather than treat as an empty list. */
export function checklistByVersion(version: unknown): Checklist | null {
  if (typeof version !== "string") return null;
  return CHECKLISTS.find((c) => c.version === version) ?? null;
}

export function checklistItem(version: unknown, key: unknown): ChecklistItem | null {
  const list = checklistByVersion(version);
  if (!list || typeof key !== "string") return null;
  return list.items.find((i) => i.key === key) ?? null;
}

export function requiredKeys(list: Checklist): string[] {
  return list.items.filter((i) => i.required).map((i) => i.key);
}

export function isItemOutcome(v: unknown): v is ItemOutcome {
  return typeof v === "string" && (ITEM_OUTCOMES as readonly string[]).includes(v);
}

export function isReviewOutcome(v: unknown): v is ReviewOutcome {
  return typeof v === "string" && (REVIEW_OUTCOMES as readonly string[]).includes(v);
}

/**
 * One item as it is stored in review_checklists.items.
 *
 * The label and the method are written into the row alongside the key, not
 * only resolved from the version at read time. The row then describes itself:
 * if this file ever loses a version, the record still says what was claimed to
 * have been checked, which is the same argument that puts a sha256 next to a
 * version string on the seal and the NDA.
 *
 * `note` is the reviewer's, and is never projected to a viewer. 126's header
 * is explicit that a note on a skipped item can name an internal tool, a
 * vendor, or a person.
 */
export interface RecordedItem {
  key: string;
  label: string;
  method: string;
  outcome: ItemOutcome;
  note?: string | null;
}

/**
 * Whether this set of answers may carry an approval.
 *
 * Enforced again in the route that writes the row: the disabled button is a
 * courtesy to the reviewer, not the rule.
 */
export function approvalBlockers(list: Checklist, answers: Record<string, ItemOutcome | undefined>): string[] {
  return requiredKeys(list).filter((k) => answers[k] !== "pass");
}

/**
 * i18n keys for the two strings a viewer reads. Namespaced by version because
 * the same item key means different things on different lists, and both lists
 * hold `identity` and `prohibited`.
 *
 * A version string is a single dot-path segment ("startup-v1" holds a hyphen,
 * not a dot), so it nests cleanly. These sit under `checklist` and not under
 * `reviewLedger.item`, which already holds the four outcome words as plain
 * strings: a dictionary node carrying strings and subtrees at once is the
 * shape a key-walking test trips over.
 *
 * Callers must fall back to the label and method stored on the row when a key
 * is absent, so a review stays readable before the dictionary catches up.
 */
export function itemLabelKey(version: string, key: string): string {
  return `reviewLedger.checklist.${version}.${key}.label`;
}

export function itemMethodKey(version: string, key: string): string {
  return `reviewLedger.checklist.${version}.${key}.method`;
}
