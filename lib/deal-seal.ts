import { createAdminClient } from "@/lib/supabase-server";
import { sha256 } from "@/lib/nda-record";
import { SUCCESS_FEE_PERCENT, NON_CIRCUMVENTION_MONTHS } from "@/lib/circumvention-text";

/**
 * The seal.
 *
 * lib/circumvention-text.ts is one-sided: the investor accepts it before they
 * may make an offer, and it binds only them. This is its bilateral
 * counterpart, and it is what actually opens a conversation. Both parties sign
 * the same bytes, the bytes name the terms they agreed, and the pair may talk
 * only once the second signature lands.
 *
 * Why a signature and not another checkbox. The fee is charged to a company
 * that will, by the time it is invoiced, have raised money and moved on. The
 * only thing that makes that invoice collectable is a record which says: these
 * two people agreed these numbers on this date, and both of them said so. An
 * acceptance click by one side is not that record.
 *
 * The tension worth naming, because the rule looks stricter than it is: you
 * cannot negotiate a round without talking, so a gate on "sealed" would be
 * absurd if sealing meant agreeing the final investment. It does not. What is
 * sealed is the RELATIONSHIP and the fee that attaches to it -- an engagement
 * letter, not a term sheet. The numbers in it are the offer that was accepted,
 * and both sides remain free to renegotiate every one of them afterwards; the
 * negotiation before the seal happens through offers and counters, which are
 * structured, on the record, and need no free text.
 *
 * Bump DEAL_SEAL_VERSION whenever the wording changes. Every signature stamps
 * the version and the hash in force when it was made, so an older seal is
 * never reinterpreted under newer terms.
 */
export const DEAL_SEAL_VERSION = "2026-09-10";

export type SealParty = "startup" | "investor";

export interface SealTermsInput {
  companyName: string;
  investorName: string;
  amount: number | null;
  currency: string | null;
  equityPct?: number | null;
  valuation?: number | null;
  instrument?: string | null;
  conditions?: string | null;
  /** The recorded introduction date, so the tail runs from a real row. */
  introducedAt?: string | Date | null;
  tailEndsAt?: string | Date | null;
}

function asDay(v: string | Date | null | undefined, fallback: string): string {
  if (!v) return fallback;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

/** Figures as plain digits with a currency code. This is evidence, not a UI. */
function money(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "an amount to be agreed";
  return `${(currency || "USD").toUpperCase()} ${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * The document of record.
 *
 * Rendered rather than stored, then hashed, for the same reason the NDA is:
 * a version string alone proves nothing if the wording is edited without a
 * bump, and a hash over these exact bytes cannot be edited afterwards. Dates
 * are ISO days because a locale-formatted date in a legal record is ambiguous
 * by construction.
 */
export function dealSealText(input: SealTermsInput): string {
  const company = input.companyName?.trim() || "the Company";
  const investor = input.investorName?.trim() || "the Investor";
  const introduced = asDay(input.introducedAt, "the date of first contact recorded by CapitalReach");
  const tailEnds = asDay(input.tailEndsAt, `${NON_CIRCUMVENTION_MONTHS} months after that date`);

  const terms: string[] = [`   Amount:      ${money(input.amount, input.currency)}`];
  if (input.equityPct !== null && input.equityPct !== undefined) {
    terms.push(`   Equity:      ${input.equityPct}%`);
  }
  if (input.valuation !== null && input.valuation !== undefined) {
    terms.push(`   Valuation:   ${money(input.valuation, input.currency)}`);
  }
  if (input.instrument) terms.push(`   Instrument:  ${input.instrument}`);
  if (input.conditions) terms.push(`   Conditions:  ${input.conditions}`);

  return `DEAL RECORD AND FEE AGREEMENT

Between ${company} ("the Company") and ${investor} ("the Investor"),
recorded by CapitalReach on the terms the Company accepted.

1. WHAT WAS AGREED. The Investor offered, and the Company accepted:

${terms.join("\n")}

   These are the terms on the table at the date of this record. They are not
   final investment documents and neither party is bound to close on them.
   Either party may renegotiate any of them. This clause fixes what was
   agreed when the conversation opened, not what must happen at the end of it.

2. THE INTRODUCTION. CapitalReach introduced these parties and records that
   introduction with its date -- ${introduced} -- the channel it happened
   through, and the version of these terms in force at the time. That date is
   fixed at introduction and is not restated by any later change to these
   terms.

3. THE FEE. A ${SUCCESS_FEE_PERCENT}% success fee is due to CapitalReach on capital the Company
   raises from the Investor where the round closes on or before ${tailEnds},
   being ${NON_CIRCUMVENTION_MONTHS} months from the recorded introduction date. The fee is charged
   to the Company. It is never charged to the Investor. It is due on the
   capital actually received, not on the amount in clause 1, so a round that
   closes smaller carries a smaller fee and a round that does not close
   carries none.

4. WHERE IT CLOSES MAKES NO DIFFERENCE. The fee applies whether the round is
   documented on this platform, by email, through a lawyer, or anywhere else,
   and whether it closes with the Investor or with any fund, syndicate,
   vehicle, employer or other entity the Investor controls, manages, advises,
   or brings to the Company on the strength of this introduction. Moving the
   conversation elsewhere does not end the obligation.

5. CONFIDENTIALITY. Each party will keep what the other discloses in
   confidence and use it only to evaluate and negotiate this investment. This
   does not displace any separate confidentiality undertaking already in force
   between them; where both apply, the stricter governs.

6. WHAT IS NOT COVERED. A relationship between these parties that demonstrably
   predates the recorded introduction date -- a prior investment, a term sheet,
   a signed confidentiality undertaking, or documented substantive contact.
   Capital raised from a party the Investor did not introduce and does not
   control, manage or advise. A round closing after the date in clause 3.

7. EVIDENCE. A claim rests on CapitalReach's own records: this record and both
   signatures with their timestamps, IP addresses and version, the offer and
   any counters that preceded it, the introduction record, and the log of what
   was disclosed. Those records are producible to either party on request.

8. NO EXCLUSIVITY. Nothing here restricts whom the Investor may invest in or
   whom the Company may raise from. It fixes only what is owed to CapitalReach
   for an introduction it made.

Signed by both parties below. Each signature records the signer's name, the
time, the network address it came from, and the hash of this exact document.`;
}

export function sealHash(text: string): string {
  return sha256(text);
}

export interface SealState {
  dealId: string;
  sealed: boolean;
  /** Null on a deal grandfathered in by migration 120. */
  sealedAt: string | null;
  startup: { signedAt: string; name: string } | null;
  investor: { signedAt: string; name: string } | null;
  /** Which side the viewer still owes, when the viewer is a party. */
  awaiting: SealParty[];
}

/**
 * Who has signed this deal.
 *
 * Reads deal_seals rather than deals.sealed_at so the answer cannot drift from
 * the signatures it is derived from: sealed_at is a cache of "both rows
 * present", and a cache that disagrees with its source is worse than no cache.
 * The grandfathered case is the one exception, and it is explicit.
 */
export async function sealState(dealId: string): Promise<SealState> {
  const admin = createAdminClient();

  const [{ data: rows }, { data: deal }] = await Promise.all([
    admin.from("deal_seals").select("party, signed_name, signed_at").eq("deal_id", dealId),
    admin.from("deals").select("sealed_at, seal_version").eq("id", dealId).maybeSingle(),
  ]);

  const find = (p: SealParty) => {
    const r = (rows ?? []).find((x) => x.party === p);
    return r ? { signedAt: r.signed_at as string, name: r.signed_name as string } : null;
  };
  const startup = find("startup");
  const investor = find("investor");

  const grandfathered = deal?.seal_version === "grandfathered" && !!deal?.sealed_at;
  const sealed = grandfathered || (!!startup && !!investor);

  const awaiting: SealParty[] = [];
  if (!grandfathered) {
    if (!startup) awaiting.push("startup");
    if (!investor) awaiting.push("investor");
  }

  return {
    dealId,
    sealed,
    sealedAt: (deal?.sealed_at as string | null) ?? null,
    startup,
    investor,
    awaiting,
  };
}

/**
 * Fails OPEN, on purpose and for the same reason every other gate here does.
 * A database blip that silently cuts every conversation on the platform is a
 * far worse outcome than a few messages passing before their seal lands, and
 * the seal is evidence for a fee claimed months later, not a lock that has to
 * hold in the millisecond.
 */
export async function isDealSealed(dealId: string): Promise<boolean> {
  try {
    return (await sealState(dealId)).sealed;
  } catch {
    return true;
  }
}
