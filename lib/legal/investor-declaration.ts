/**
 * The category an investor puts themselves in, as data.
 *
 * profiles.investor_status_declared (126) governs what may lawfully be shown
 * to a member, and the migration is explicit about whose record this is: the
 * member asserts, the SERVER writes, and profiles_review_fields_server_only
 * rejects a client-key update of the column. What has to be provable later is
 * not what the member is, it is that we ASKED and when.
 *
 * Everything below is the question, not the answer. Nothing here decides a
 * member's category, applies a threshold, or gates anything. A route renders
 * these options, records which one was chosen, and stamps the time.
 *
 *
 * ON THE TWO THAT NAME A STATUTE.
 *
 * Two of these categories are terms of art from financial regulation, and the
 * summaries below are a plain-language paraphrase written from general
 * knowledge, for a member to recognise themselves in. They are NOT a statement
 * of the legal test and must not be presented as one. Each carries a [LAWYER]
 * marker at the point where the paraphrase is doing the work, and
 * `needsLawyerReview` is true on both so a caller cannot render one without
 * the fact being visible in the data.
 *
 * No article, paragraph or section number is cited anywhere in this file. That
 * is deliberate rather than an omission: I am not certain which provisions
 * govern a platform of this shape in either Germany or the UK, whether the
 * German implementation restates the European wording or alters it, or whether
 * a UK member falls under the onshored rules or the European ones. A confident
 * wrong citation in a document a member relies on is worse than no citation,
 * so the numbers are left for a lawyer to supply.
 */

export const INVESTOR_DECLARATION_VALUES = [
  "professional_client",
  "semi_professional",
  "private_experienced",
  "not_declared",
] as const;

export type InvestorDeclarationValue = (typeof INVESTOR_DECLARATION_VALUES)[number];

export interface InvestorDeclarationOption {
  readonly value: InvestorDeclarationValue;
  /** The name of the category, as the member sees it. */
  readonly label: string;
  /** What the member is asserting by choosing it, in the first person. */
  readonly summary: string;
  /**
   * The indicative tests, shown so a member can recognise themselves. Written
   * as "commonly summarised as" wherever the underlying test is statutory,
   * because that is what they are: a recognition aid, not a definition.
   */
  readonly criteria: readonly string[];
  /**
   * True where the wording paraphrases a statutory test that no lawyer has
   * reviewed. A surface rendering an option with this set must not present its
   * criteria as the legal position.
   */
  readonly needsLawyerReview: boolean;
  /**
   * Whether a member may choose it. 'not_declared' is the absence of a choice,
   * backfilled onto every row that predates 126, and a route that writes it as
   * though somebody selected it destroys the one fact the column exists to
   * hold: whether the question was ever put.
   */
  readonly selectable: boolean;
}

export const INVESTOR_DECLARATIONS: readonly InvestorDeclarationOption[] = [
  {
    value: "professional_client",
    label: "Professional client",
    summary:
      "I am a professional client: an institution, or a firm or individual who has the experience, knowledge and expertise to make my own investment decisions and properly assess the risks I take on.",
    criteria: [
      // [LAWYER] Everything in this array paraphrases the MiFID II professional
      // client test from general knowledge. The category splits into clients
      // who are professional by their nature and clients who ask to be treated
      // as professional on meeting size or experience thresholds, and the
      // thresholds are monetary figures I have not verified against a current
      // text. I am NOT certain of the applicable article, of whether the German
      // implementation restates or varies it, or of what a UK member falls
      // under after onshoring. This is a recognition aid for a member. It is
      // not the test, and a lawyer has to settle both the wording and the
      // figures before any of it is presented as settled.
      "Commonly summarised as: a bank, investment firm, insurance company, fund, pension scheme or other regulated financial institution.",
      "Commonly summarised as: a large company meeting size thresholds for balance sheet, turnover or own funds. The thresholds themselves are not stated here and need confirming.",
      "Commonly summarised as: an individual who has asked to be treated as professional and who meets tests on the frequency and size of their dealing, the size of their portfolio, and time spent working professionally in the financial sector.",
      "Choosing this category means giving up protections that apply to ordinary private investors.",
    ],
    needsLawyerReview: true,
    selectable: true,
  },
  {
    value: "semi_professional",
    label: "Semi-professional investor",
    summary:
      "I am a semi-professional investor: not a professional client, but committing an amount and holding a level of experience that places me in a distinct category under German fund law.",
    criteria: [
      // [LAWYER] This paraphrases the semi-professional investor category from
      // the German KAGB, again from general knowledge. As I understand it the
      // category turns on a minimum commitment, a written confirmation by the
      // investor, and an assessment of their expertise and understanding of the
      // risks by the manager, with a separate and much higher commitment
      // threshold that stands on its own. I am NOT certain of the section, of
      // the current figures, or of whether this category is available at all to
      // a platform that is not an AIF manager. Nothing in this product performs
      // the assessment the category appears to require. A lawyer has to settle
      // whether we may offer this option before it is shown to anyone.
      "Commonly summarised as: committing at least a stated minimum amount, confirming in writing that you understand the risks, and being assessed as having the expertise to take them on.",
      "Commonly summarised as: alternatively, committing an amount far above that minimum, with no assessment required.",
      "The figures are not stated here and need confirming. The assessment this category refers to is not something this platform carries out.",
    ],
    needsLawyerReview: true,
    selectable: true,
  },
  {
    value: "private_experienced",
    label: "Private investor with experience",
    summary:
      "I am a private individual investing my own money. I am not a professional client and I do not meet the semi-professional thresholds. I have invested in private companies before and I understand what that involves.",
    criteria: [
      // Ours, not anybody's statute. It exists because the honest answer for
      // most members here is none of the above, and a list that omits it pushes
      // people into a category they do not belong in so they can carry on.
      "I invest my own money, not money I hold for other people.",
      "I have previously invested in private or early-stage companies, or I have worked closely with them.",
      "I accept that I may lose everything I put in, that I may not be able to sell my holding for years or at all, and that no compensation scheme covers these investments.",
      "I accept that CapitalReach does not audit the figures on a listing and does not give investment advice.",
    ],
    needsLawyerReview: false,
    selectable: true,
  },
  {
    value: "not_declared",
    label: "Not declared",
    summary:
      "No category has been recorded for this account. The question has not been put, or it was put and not answered.",
    criteria: [],
    needsLawyerReview: false,
    selectable: false,
  },
];

export const SELECTABLE_DECLARATIONS: readonly InvestorDeclarationOption[] =
  INVESTOR_DECLARATIONS.filter((d) => d.selectable);

export function isInvestorDeclaration(v: unknown): v is InvestorDeclarationValue {
  return typeof v === "string" && (INVESTOR_DECLARATION_VALUES as readonly string[]).includes(v);
}

/** The option a stored value stands for. Null for anything the column should
 *  not be holding, which a caller must render as unknown rather than as a
 *  category the member did not pick. */
export function investorDeclaration(value: unknown): InvestorDeclarationOption | null {
  if (!isInvestorDeclaration(value)) return null;
  return INVESTOR_DECLARATIONS.find((d) => d.value === value) ?? null;
}

/** A declared category, as opposed to the backfilled absence of one. This is
 *  the only question the `declaration` checklist item can answer. */
export function hasDeclared(value: unknown): boolean {
  return isInvestorDeclaration(value) && value !== "not_declared";
}

export function declarationLabelKey(value: InvestorDeclarationValue): string {
  return `declaration.option.${value}.label`;
}

export function declarationSummaryKey(value: InvestorDeclarationValue): string {
  return `declaration.option.${value}.summary`;
}

export function declarationCriterionKey(value: InvestorDeclarationValue, index: number): string {
  return `declaration.option.${value}.criteria.${index}`;
}
