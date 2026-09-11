import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction, atLeast } from "@/lib/admin-guard";
import { REGISTRY_CONFIGURED } from "@/lib/registry";
import { SUCCESS_FEE_PERCENT } from "@/lib/circumvention-text";
import {
  REGISTER_CHECK_DAYS,
  registerIsQueryable,
  registerLookupUrl,
} from "@/lib/register-check";

/**
 * The register bench.
 *
 * One row per closed round whose ninety days have run out, carrying the two
 * numbers that are about to be compared and nothing that would prejudice the
 * comparison. There is no score here and no flag: a round is in this queue
 * because a clock expired, not because anybody suspects anything of it.
 *
 * The identity columns 125 added to `startups` -- legal entity name, register
 * type, register number -- are read here and nowhere else in the product. They
 * are deliberately outside the client-key column grant (109, 112), so the
 * service-role client behind requireAdmin is the only way to them, and every
 * listing is written to the admin log because "who read whose register
 * identity" is an auditable question. They must never reach an investor: an
 * entity name and a register number find the founders, the address and the
 * shareholders in about a minute, which is the circumvention route the fee
 * model exists to close.
 */

export const dynamic = "force-dynamic";

/** A bench works a screen at a time; past this the reviewer is scrolling, not
 *  reviewing. The count of what is waiting is returned separately. */
const MAX_ROWS = 100;

// One unbroken literal. supabase-js infers the row shape from the TEXT of this
// string, so splitting it with + widens the type to `string` and every field
// comes back as GenericStringError instead of its real type.
const QUEUE_COLUMNS =
  "id, amount, currency, closed_at, success_fee_amount, register_check_due, register_check_status, register_filed_amount, startup:startups(id, name, slug, legal_entity_name, register_type, register_number), investor:investors(id, display_name, firm_name)";

type StartupJoin = {
  id: string;
  name: string | null;
  slug: string | null;
  legal_entity_name: string | null;
  register_type: string | null;
  register_number: string | null;
} | null;

type InvestorJoin = { id: string; display_name: string | null; firm_name: string | null } | null;

export async function GET() {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("deals")
    .select(QUEUE_COLUMNS)
    .eq("register_check_status", "due")
    .lte("register_check_due", today)
    .order("register_check_due", { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    console.error("[admin/register-checks]", error);
    return NextResponse.json({ error: "Could not load the queue" }, { status: 500 });
  }

  const rows = (data ?? []).map((d) => {
    const startup = d.startup as unknown as StartupJoin;
    const investor = d.investor as unknown as InvestorJoin;
    return {
      dealId: d.id,
      declaredAmount: d.amount === null ? null : Number(d.amount),
      currency: d.currency,
      closedAt: d.closed_at,
      dueOn: d.register_check_due,
      // Present only on a row whose verdict is being corrected; a first pass
      // has nothing filed yet.
      filedAmount: d.register_filed_amount === null ? null : Number(d.register_filed_amount),
      successFeeAmount: d.success_fee_amount === null ? null : Number(d.success_fee_amount),
      startupId: startup?.id ?? null,
      startupName: startup?.name ?? null,
      startupSlug: startup?.slug ?? null,
      legalEntityName: startup?.legal_entity_name ?? null,
      registerType: startup?.register_type ?? null,
      registerNumber: startup?.register_number ?? null,
      registerUrl: registerLookupUrl(startup?.register_type, startup?.register_number),
      // Whether a machine can answer, which is not the same as whether a
      // register exists. Handelsregister has no public API at all, and a UK
      // number is only queryable when a key is configured on this deployment.
      queryable: registerIsQueryable(startup?.register_type) && REGISTRY_CONFIGURED,
      investorName: investor?.display_name ?? investor?.firm_name ?? null,
    };
  });

  await logAdminAction(admin, guard.adminId, "register_check_list", "platform", null, {
    rows: rows.length,
    deal_ids: rows.map((r) => r.dealId),
  });

  return NextResponse.json({
    rows,
    viewerLevel: guard.level,
    // Raising money against somebody and marking their record are separate
    // from recording what the register says, and the queue greys its own
    // controls rather than letting a reviewer discover the rule from a 403.
    canActOnDiscrepancy: atLeast(guard.level, "owner"),
    feePercent: SUCCESS_FEE_PERCENT,
    checkDays: REGISTER_CHECK_DAYS,
    registryConfigured: REGISTRY_CONFIGURED,
  });
}
