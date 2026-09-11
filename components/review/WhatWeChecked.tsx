import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { formatDate, isUuid } from "@/lib/utils";
import {
  checklistByVersion,
  itemLabelKey,
  itemMethodKey,
  type ItemOutcome,
  type ReviewSubjectType,
} from "@/lib/review/checklists";

/**
 * What was checked, shown with its gaps in it.
 *
 * A server component rather than a client component with a fetch, because this
 * IS the projection 126's header describes. review_checklists is RLS on with
 * no policy, so there is no path to the row except server code that names the
 * columns and the jsonb keys it is willing to publish, and doing that in one
 * place beats doing it in a route the component then has to trust.
 *
 * What never leaves: reviewer_id, which names an individual, and
 * outcome_reason, which is an admin's private judgement about a company
 * written for the next admin. Neither is selected at all. A read that does not
 * ask for a column cannot leak it through a later edit to the render. Item
 * notes are in the same position: they are inside `items`, they can name an
 * internal tool or a vendor or a person, and only four keys per item are read
 * out of that jsonb.
 *
 * THE CASE THIS MODULE IS BUILT AROUND is the one where there is nothing to
 * show. No review row, or a read that failed: the module still renders, and it
 * says so in the same words it would use for a bad result. A transparency
 * module that disappears when it has no data tells an investor the listing is
 * clean, which is the exact opposite of what is true, and it fails silently in
 * the one direction a viewer cannot detect. Every early return below renders
 * the frame.
 */

type ModuleState = "reviewed" | "none" | "unavailable";

/** Only these four keys are read out of the items jsonb. */
interface PublishedItem {
  key: string;
  label: string;
  method: string;
  outcome: ItemOutcome | null;
}

const UI = "'DM Sans', sans-serif";

const labelStyle: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "10px", letterSpacing: "0.07em",
  textTransform: "uppercase", color: "var(--cr-ink-4)",
};

const bodyStyle: React.CSSProperties = {
  fontFamily: UI, fontWeight: 300, fontSize: "13px", lineHeight: 1.65,
  color: "var(--cr-ink-3)", margin: 0,
};

const chipBase: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", borderRadius: "3px",
  padding: "2px 7px", fontFamily: UI, fontWeight: 500, fontSize: "10px",
  letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap",
  border: "1px solid currentColor",
};

/** A recorded outcome and a MISSING one are drawn differently on purpose. An
 *  item absent from the record reads to a viewer as an item that passed, so it
 *  gets the loudest treatment on the row, not the quietest. */
function outcomeColor(outcome: ItemOutcome | null): string {
  if (outcome === "pass") return "var(--verdigris)";
  if (outcome === "fail") return "var(--cr-down)";
  if (outcome === "na") return "var(--cr-ink-4)";
  return "var(--cr-copper)";
}

function isItemOutcomeValue(v: unknown): v is ItemOutcome {
  return v === "pass" || v === "fail" || v === "na";
}

/**
 * The row's items, resolved against the version they were recorded under.
 *
 * Iterates the DEFINITION and not the stored array, so an item the reviewer
 * never answered appears as unanswered instead of vanishing. Where the version
 * is one this build no longer carries, the stored items are used directly:
 * each row writes its own label and method, which is what makes that fallback
 * possible at all.
 */
function publishItems(version: unknown, raw: unknown): PublishedItem[] {
  const stored = new Map<string, Record<string, unknown>>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      if (typeof rec.key === "string") stored.set(rec.key, rec);
    }
  }

  const readOne = (key: string, rec: Record<string, unknown> | undefined, fallbackLabel: string, fallbackMethod: string): PublishedItem => ({
    key,
    label: typeof rec?.label === "string" && rec.label ? rec.label : fallbackLabel,
    method: typeof rec?.method === "string" && rec.method ? rec.method : fallbackMethod,
    outcome: isItemOutcomeValue(rec?.outcome) ? rec.outcome : null,
  });

  const definition = checklistByVersion(version);
  if (definition) {
    return definition.items.map((item) => readOne(item.key, stored.get(item.key), item.label, item.method));
  }
  return Array.from(stored.entries()).map(([key, rec]) => readOne(key, rec, key.replace(/_/g, " "), ""));
}

export default async function WhatWeChecked({
  subjectType,
  subjectId,
}: {
  subjectType: ReviewSubjectType;
  subjectId: string;
}) {
  const t = await getTranslator(getLocale());
  /** Renders before the dictionary has these keys. A missing key must not put
   *  a dot-path where a sentence about audited figures belongs. */
  const tf = (key: string, fallback: string, vars?: Record<string, string | number>) => {
    const out = t(key, vars);
    return out === key ? fallback : out;
  };

  let state: ModuleState = "none";
  let version: string | null = null;
  let outcome: string | null = null;
  let reviewedAt: string | null = null;
  let items: PublishedItem[] = [];

  if (!isUuid(subjectId)) {
    state = "unavailable";
  } else {
    try {
      // types/supabase.ts is generated and has not been regenerated since 126,
      // so the table that migration added is not yet in the Database union.
      // The loose handle is scoped to this one read rather than applied to the
      // client, and every field it returns is narrowed below before use.
      const admin = createAdminClient() as unknown as SupabaseClient;
      // reviewer_id and outcome_reason are absent from this list, not filtered
      // out of it. See the header.
      const { data, error } = await admin
        .from("review_checklists")
        .select("checklist_version, items, outcome, reviewed_at")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .order("reviewed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // Captured, not discarded. An unsurfaced error here would render as
        // "no review recorded", which is a different and untrue claim.
        console.error("[WhatWeChecked] review read failed:", error.message);
        state = "unavailable";
      } else if (!data) {
        state = "none";
      } else {
        state = "reviewed";
        version = typeof data.checklist_version === "string" ? data.checklist_version : null;
        outcome = typeof data.outcome === "string" ? data.outcome : null;
        reviewedAt = typeof data.reviewed_at === "string" ? data.reviewed_at : null;
        items = publishItems(version, data.items);
      }
    } catch (err) {
      console.error("[WhatWeChecked] review read threw:", err);
      state = "unavailable";
    }
  }

  const outcomeLine =
    outcome === "approved" ? tf("reviewLedger.outcome.approved", "Reviewed and listed.")
    : outcome === "rejected" ? tf("reviewLedger.outcome.rejected", "Reviewed and not accepted.")
    : outcome === "changes_requested" ? tf("reviewLedger.outcome.changes_requested", "Reviewed, with changes asked for.")
    : null;

  return (
    <section
      aria-labelledby="what-we-checked-title"
      style={{
        border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
        background: "var(--cr-paper)", padding: "20px 22px",
        display: "flex", flexDirection: "column", gap: "16px",
      }}
    >
      <div>
        <h2 id="what-we-checked-title" className="ruled-label" style={{ marginBottom: "8px" }}>
          {tf("reviewLedger.title", "What we checked")}
        </h2>
        <p style={bodyStyle}>
          {tf(
            "reviewLedger.intro",
            "This is the list a reviewer worked through, and what each line actually involves. The checks that were not done are on it too.",
          )}
        </p>
      </div>

      {state === "unavailable" && (
        <p style={{ ...bodyStyle, color: "var(--cr-ink-2)" }}>
          {tf(
            "reviewLedger.unavailable",
            "The review record for this listing could not be loaded. This does not mean the listing was reviewed and it does not mean it was not. Nothing about what was or was not checked can be shown here right now.",
          )}
        </p>
      )}

      {state === "none" && (
        <p style={{ ...bodyStyle, color: "var(--cr-ink-2)" }}>
          {tf(
            "reviewLedger.none",
            "No review is recorded for this listing. Nothing on it has been checked by us.",
          )}
        </p>
      )}

      {state === "reviewed" && (
        <>
          <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", margin: 0 }}>
            {outcomeLine ? `${outcomeLine} ` : ""}
            {reviewedAt
              ? tf("reviewLedger.reviewedOn", `Reviewed ${formatDate(reviewedAt)}.`, { date: formatDate(reviewedAt) })
              : tf("reviewLedger.reviewedUndated", "The date of this review was not recorded.")}
            {version ? ` ${tf("reviewLedger.listVersion", `List ${version}.`, { version })}` : ""}
          </p>

          {items.length === 0 ? (
            <p style={{ ...bodyStyle, color: "var(--cr-ink-2)" }}>
              {tf(
                "reviewLedger.emptyItems",
                "A review was recorded for this listing, but it carries no items. Nothing can be shown about what was checked.",
              )}
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
              {items.map((item) => {
                const color = outcomeColor(item.outcome);
                const outcomeWord =
                  item.outcome === "pass" ? tf("reviewLedger.item.pass", "Checked")
                  : item.outcome === "fail" ? tf("reviewLedger.item.fail", "Not passed")
                  : item.outcome === "na" ? tf("reviewLedger.item.na", "Not applicable")
                  : tf("reviewLedger.item.missing", "Not recorded");
                return (
                  <li key={item.key} style={{ borderTop: "1px solid var(--cr-rule)", paddingTop: "12px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: UI, fontWeight: 600, fontSize: "13.5px", color: "var(--cr-ink)" }}>
                        {tf(itemLabelKey(version ?? "", item.key), item.label)}
                      </span>
                      <span style={{ ...chipBase, color }}>{outcomeWord}</span>
                    </div>
                    {/* The method is always open. It is the part that says how
                        shallow the check is, and a check described only behind
                        a toggle is a check most readers will take on trust. */}
                    <p style={{ ...bodyStyle, fontSize: "12.5px", marginTop: "6px" }}>
                      {tf(itemMethodKey(version ?? "", item.key), item.method)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* Rendered in every state, never inside a toggle, never behind a plan
          gate, never conditional on anything above it. A reader who sees this
          module at all has seen this paragraph. Do not wrap it in <details>. */}
      <p
        style={{
          fontFamily: UI, fontWeight: 400, fontSize: "12.5px", lineHeight: 1.6,
          color: "var(--cr-ink-2)", margin: 0,
          borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "14px",
        }}
      >
        {tf(
          "reviewLedger.selfReported",
          "Revenue, traction, and financial figures are self-reported by the founder and have not been audited or independently confirmed. Conduct your own due diligence before investing.",
        )}
      </p>
    </section>
  );
}
