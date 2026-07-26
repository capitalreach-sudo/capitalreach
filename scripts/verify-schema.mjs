#!/usr/bin/env node
// Checks a Supabase database actually has everything the migrations define.
//
// Migrations are applied by hand through the SQL editor, so it is possible to
// skip one and not notice: the app keeps building, and only the queries that
// touch the missing columns fail — at runtime, often as a 404 or a silently
// empty result. Migrations 005 and 008 were both missing this way for a while.
// 008 made every investor profile 404; 005 made the database reject the exact
// tier values the Stripe webhook writes, so a paying customer would have stayed
// on the free plan.
//
// Usage:
//   node scripts/verify-schema.mjs                  # uses .env.local
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-schema.mjs
//
// Exits non-zero if anything is missing, so it can gate a deploy.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnvLocal();
const URL_ = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Tables every migration is expected to have produced.
const TABLES = [
  "profiles", "startups", "startup_founders", "startup_milestones",
  "startup_documents", "investors", "watchlists", "threads", "messages",
  "deals", "nda_records", "ai_reports", "pageviews", "email_logs",
  "admin_actions", "platform_config", "contracts", "deal_activity",
  "startup_views",
];

// One entry per migration that adds columns, so a skipped migration is named
// rather than showing up as a mystery missing column.
const COLUMNS = [
  ["004", "investors", "display_name,firm_name,investment_thesis,aum,portfolio_json,lead_rounds,number_of_investments"],
  ["004", "startups", "founded_date,city,business_model,team_size,churn_rate,pitch_deck_url,runway_months,competitors_json"],
  ["004", "startup_founders", "twitter_url,bio"],
  ["006", "profiles", "stripe_subscription_id"],
  ["006", "platform_config", "key,value"],
  ["008", "startups", "target_markets,languages,previous_funding,lead_investor,deck_language,video_pitch_url,social_proof,looking_for"],
  ["008", "profiles", "investment_thesis,check_size_min,check_size_max,preferred_stages,preferred_industries,preferred_countries,investor_type,portfolio_count,lead_investor,languages"],
  ["009", "profiles", "preferred_locale"],
  ["012", "threads", "recipient_startup_id"],
  ["013", "deals", "currency"],
  ["014", "contracts", "deal_id,startup_id,investor_id,created_by,title,contract_type,amount,currency,equity_percent,terms,status"],
  ["015", "deal_activity", "deal_id,startup_id,investor_id,actor_id,type,body"],
  ["016", "deals", "next_follow_up"],
  ["017", "profiles", "suspended,suspended_at,suspended_reason,suspended_by,suspended_until,account_status,terms_accepted_at,investor_declarations"],
  ["017", "deals", "notes,term_sheet_url,closed_at,passed_at,success_fee_amount"],
  ["017", "admin_actions", "details"],
  ["017", "startup_views", "startup_id,investor_id,viewed_at"],
];

// Postgres functions the app calls via RPC.
const FUNCTIONS = [
  ["002", "increment_pageview", { startup_id: "00000000-0000-0000-0000-000000000000" }],
  ["017", "is_suspended", {}],
];

let failures = 0;
const note = (ok, label) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "MISS"}  ${label}`);
};

console.log(`\nVerifying schema at ${URL_}\n`);

console.log("Tables");
for (const t of TABLES) {
  const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=0`, { headers: H });
  note(r.status === 200, t);
}

console.log("\nColumns by migration");
for (const [mig, table, cols] of COLUMNS) {
  const r = await fetch(`${URL_}/rest/v1/${table}?select=${cols}&limit=0`, { headers: H });
  let detail = "";
  if (r.status !== 200) {
    const b = await r.json().catch(() => ({}));
    detail = ` <- ${b.message ?? r.status}`;
  }
  note(r.status === 200, `${mig}  ${table}${detail}`);
}

console.log("\nFunctions");
for (const [mig, fn, args] of FUNCTIONS) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await r.text();
  note(!body.includes("Could not find"), `${mig}  ${fn}()`);
}

// 005 rewrote the tier CHECK constraints. Nothing about it is visible as a
// column, so probe it: 'starter' is only accepted once 005 has run. Checked
// read-only by asking PostgREST to filter on the value rather than writing it.
console.log("\nConstraints");
{
  const r = await fetch(`${URL_}/rest/v1/profiles?subscription_tier=eq.starter&select=id&limit=0`, { headers: H });
  // A filter never violates a CHECK, so this only proves the column exists.
  // The real 005 signal is whether an insert of 'starter' would be rejected —
  // that needs a write, so it is reported as advisory rather than tested here.
  note(r.status === 200, "005  profiles.subscription_tier readable (run db:verify:tiers to test values)");
}

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check(s) failed - a migration is probably unapplied.\n`
);
process.exit(failures === 0 ? 0 : 1);
