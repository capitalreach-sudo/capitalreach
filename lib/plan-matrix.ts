import {
  FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST,
  type FounderPlan, type InvestorPlan,
} from "@/lib/plans";
import { founderCan, investorCan, type AccessContext } from "@/lib/access";

/**
 * The comparison table, generated from the gates the app actually enforces.
 *
 * Writing the table by hand is how pricing pages come to promise things the
 * product does not do: the copy and the gate drift, and only the customer
 * finds out. Every cell here is produced by calling founderCan/investorCan
 * with that plan's tier, so the table cannot claim a capability the code
 * would refuse — and adding a feature to a plan updates the page for free.
 */

export type CellValue = boolean | number | "unlimited" | string;

export interface MatrixRow {
  key: string;
  /** i18n key for the row label. */
  labelKey: string;
  /** i18n key for the "what is this?" explanation, when the term needs one. */
  infoKey?: string;
  /** Group heading this row sits under. */
  group: string;
  values: CellValue[];
}

/** A context for one tier with launch mode off — the table describes the plans, not the promotion. */
const ctxFor = (role: "startup" | "investor", tier: string): AccessContext => ({
  userId: null, role, tier, suspended: false, isLaunchMode: false,
});

const num = (n: number): CellValue => (n === Infinity ? "unlimited" : n);

export function founderMatrix(): { plans: FounderPlan[]; rows: MatrixRow[] } {
  const plans = FOUNDER_PLANS_LIST;
  const caps = plans.map(p => founderCan(ctxFor("startup", p.id)));

  const rows: MatrixRow[] = [
    { key: "listed", group: "visibility", labelKey: "compare.f.listed", values: caps.map(c => c.listStartup) },
    { key: "listings", group: "visibility", labelKey: "compare.f.listings", values: caps.map(c => num(c.listingLimit)) },
    { key: "customSlug", group: "visibility", labelKey: "compare.f.customSlug", values: plans.map(p => p.features.customSlug) },
    { key: "demoVideo", group: "visibility", labelKey: "compare.f.demoVideo", values: caps.map(c => c.demoVideo) },
    { key: "priorityReview", group: "visibility", labelKey: "compare.f.priorityReview", infoKey: "glossary.priorityReview", values: caps.map(c => c.priorityReview) },

    { key: "analytics", group: "insight", labelKey: "compare.f.analytics", values: caps.map(c => c.analyticsLevel === "full") },
    { key: "aiScore", group: "insight", labelKey: "compare.f.aiScore", infoKey: "glossary.aiScore", values: caps.map(c => c.aiPitchScore) },
    { key: "aiWritten", group: "insight", labelKey: "compare.f.aiWritten", values: caps.map(c => c.aiWrittenFeedback) },
    // The site assistant is top-plan only — the ids here must match
    // checkAiAccess("assistant") in lib/ai-access, which is the enforcing gate.
    { key: "assistant", group: "insight", labelKey: "compare.f.assistant", infoKey: "glossary.assistant", values: plans.map(p => p.id === "growth") },
    { key: "exportData", group: "insight", labelKey: "compare.f.exportData", values: caps.map(c => c.exportData) },

    { key: "identity", group: "pipeline", labelKey: "compare.f.identity", infoKey: "glossary.investorIdentity", values: caps.map(c => c.seeInvestorIdentity) },
    { key: "teamSeats", group: "pipeline", labelKey: "compare.f.teamSeats", values: caps.map(c => num(c.teamSeats)) },
    { key: "externalContacts", group: "pipeline", labelKey: "compare.f.externalContacts", infoKey: "glossary.externalContacts", values: caps.map(c => c.externalContacts) },
    { key: "investorUpdates", group: "pipeline", labelKey: "compare.f.investorUpdates", values: caps.map(c => c.investorUpdates) },

    { key: "documents", group: "diligence", labelKey: "compare.f.documents", values: caps.map(c => num(c.docLimit)) },
    { key: "dataRoom", group: "diligence", labelKey: "compare.f.dataRoom", infoKey: "glossary.dataRoom", values: caps.map(c => c.dataRoom) },
    { key: "nda", group: "diligence", labelKey: "compare.f.nda", infoKey: "glossary.nda", values: caps.map(c => c.useNDA) },
  ];

  return { plans, rows };
}

export function investorMatrix(): { plans: InvestorPlan[]; rows: MatrixRow[] } {
  const plans = INVESTOR_PLANS_LIST;
  const caps = plans.map(p => investorCan(ctxFor("investor", p.id)));

  const rows: MatrixRow[] = [
    { key: "browse", group: "access", labelKey: "compare.i.browse", values: caps.map(c => c.browse) },
    { key: "financials", group: "access", labelKey: "compare.i.financials", values: caps.map(c => c.viewFinancials) },
    { key: "documents", group: "access", labelKey: "compare.i.documents", values: caps.map(c => c.viewDocuments) },
    { key: "team", group: "access", labelKey: "compare.i.team", values: caps.map(c => c.viewTeam) },
    { key: "nda", group: "access", labelKey: "compare.i.nda", infoKey: "glossary.nda", values: caps.map(c => c.ndaRequest) },

    { key: "message", group: "outreach", labelKey: "compare.i.message", values: caps.map(c => num(c.messageLimit)) },
    { key: "watchlist", group: "outreach", labelKey: "compare.i.watchlist", values: caps.map(c => num(c.watchlistLimit)) },
    { key: "savedSearches", group: "outreach", labelKey: "compare.i.savedSearches", infoKey: "glossary.savedSearch", values: caps.map(c => c.savedSearches) },
    { key: "advancedFilters", group: "outreach", labelKey: "compare.i.advancedFilters", values: caps.map(c => c.advancedFilters) },
    { key: "coInvestors", group: "outreach", labelKey: "compare.i.coInvestors", infoKey: "glossary.coInvestor", values: caps.map(c => c.coInvestorVisibility) },

    { key: "aiScore", group: "analysis", labelKey: "compare.i.aiScore", infoKey: "glossary.aiScore", values: caps.map(c => c.aiScore) },
    { key: "assistant", group: "analysis", labelKey: "compare.i.assistant", infoKey: "glossary.assistant", values: plans.map(p => p.id === "institution") },
    { key: "aiMatching", group: "analysis", labelKey: "compare.i.aiMatching", infoKey: "glossary.aiMatching", values: caps.map(c => c.aiMatching) },
    { key: "aiDiligence", group: "analysis", labelKey: "compare.i.aiDiligence", infoKey: "glossary.aiDiligence",
      values: caps.map(c => (c.aiDiligence === "included" ? true : c.aiDiligence === "paid" ? "payPerReport" : false)) },
    { key: "scorecards", group: "analysis", labelKey: "compare.i.scorecards", infoKey: "glossary.scorecard", values: caps.map(c => c.scorecards) },
    { key: "checklists", group: "analysis", labelKey: "compare.i.checklists", values: caps.map(c => c.checklistTemplates) },

    { key: "portfolio", group: "portfolio", labelKey: "compare.i.portfolio", values: caps.map(c => c.portfolio) },
    { key: "allocation", group: "portfolio", labelKey: "compare.i.allocation", infoKey: "glossary.allocation", values: caps.map(c => c.allocationTracking) },
    { key: "export", group: "portfolio", labelKey: "compare.i.export", values: caps.map(c => c.dataExport) },
    { key: "support", group: "portfolio", labelKey: "compare.i.support", values: plans.map(p => p.features.institutionSupport) },
  ];

  return { plans, rows };
}
