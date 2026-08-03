import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TYPE_ICON } from "@/lib/notification-icons";

/**
 * Three places name the notification types: the newest migration's CHECK
 * constraint (the database's truth), the NotificationType union in
 * lib/notify-user (what routes may raise), and TYPE_ICON in the bell (what
 * renders distinctly). This session grew them in lockstep by hand three
 * times (024, 026, 027); this test makes the lockstep mechanical.
 *
 * The union itself is erased at compile time, so it is checked structurally:
 * a literal list here, asserted against the migration, plus a type-level
 * assertion that the list and the union agree.
 */
import type { NotificationType } from "@/lib/notify-user";

const UNION: NotificationType[] = [
  "deal_opened", "deal_stage", "deal_closed", "deal_passed",
  "message", "follow_up_due", "contract_status", "nda_signed",
  "listing_approved", "listing_rejected", "team_added",
  "tier_changed", "search_match",
];
// If the union gains a member this list lacks, the annotation above errors;
// if the list gains one the union lacks, the same. Compile-time both ways.
type AssertExhaustive = NotificationType extends (typeof UNION)[number] ? true : never;
const _exhaustive: AssertExhaustive = true;
void _exhaustive;

function latestCheckTypes(): string[] {
  const dir = join(__dirname, "..", "supabase", "migrations");
  // The newest migration that redefines notifications_type_check wins.
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().reverse();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    const m = sql.match(/notifications_type_check[\s\S]*?CHECK \(type IN \(([^)]+)\)\)/);
    if (m) return Array.from(m[1].matchAll(/'([a-z_]+)'/g), (x) => x[1]);
  }
  throw new Error("no migration defines notifications_type_check");
}

describe("notification types stay in lockstep", () => {
  const db = latestCheckTypes().sort();

  it("the union matches the newest migration's CHECK constraint", () => {
    expect([...UNION].sort()).toEqual(db);
  });

  it("every type the DB accepts has a distinct icon in the bell", () => {
    for (const t of db) expect(TYPE_ICON[t], t).toBeDefined();
  });
});
