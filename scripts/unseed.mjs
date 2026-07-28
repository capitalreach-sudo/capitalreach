#!/usr/bin/env node
// Removes everything scripts/seed-staging.mjs created.
//
// The seed creates real auth users, and on production real publicly-visible
// listings. This is the way back out. It keys off the @staging.test email
// suffix, which every seeded account uses -- nothing else in the database has
// that suffix, so the blast radius is exactly the demo data.
//
// Deleting the auth user cascades to profiles, and profiles cascades to
// startups / investors / deals / watchlists / messages via ON DELETE CASCADE,
// so removing the users is sufficient. Owned rows are counted before and after
// to prove it actually happened rather than assuming the cascade fired.
//
//   node scripts/unseed.mjs                 # staging
//   node scripts/unseed.mjs --production    # production, deliberate
//   node scripts/unseed.mjs --dry-run       # list what would go, delete nothing

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_REF = "zhhcsnvkjkxexijiocly";
const SEED_SUFFIX = "@staging.test";

function loadEnv(file) {
  const p = join(root, file);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const PRODUCTION = process.argv.includes("--production");
const DRY_RUN = process.argv.includes("--dry-run");

// On --production, read the production env explicitly rather than whatever
// .env.local happens to point at today.
const env = PRODUCTION
  ? loadEnv(".env.local.production-backup")
  : { ...loadEnv(".env.local"), ...loadEnv(".env.staging") };

const URL_ = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Missing Supabase URL / service role key."); process.exit(2); }

const isProd = URL_.includes(PRODUCTION_REF);
if (isProd && !PRODUCTION) {
  console.error(`\nRefusing: ${URL_} is production. Re-run with --production if that is the intent.\n`);
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });

console.log(`\nTarget: ${URL_}${isProd ? "  (PRODUCTION)" : ""}${DRY_RUN ? "  [dry run]" : ""}\n`);

// ── Find the seeded users ───────────────────────────────────────────────────
const listed = await (await fetch(`${URL_}/auth/v1/admin/users?per_page=1000`, { headers: H })).json();
const seeded = (listed.users || []).filter(u => u.email?.endsWith(SEED_SUFFIX));

if (seeded.length === 0) { console.log("Nothing to remove — no accounts with that suffix.\n"); process.exit(0); }

const count = async (t, col, ids) => {
  const r = await rest(`${t}?select=id&${col}=in.(${ids.join(",")})`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  return (r.headers.get("content-range") || "/0").split("/")[1];
};
const ids = seeded.map(u => u.id);

console.log(`  ${seeded.length} seeded accounts`);
console.log(`  ${await count("startups", "owner_id", ids)} startups`);
console.log(`  ${await count("investors", "owner_id", ids)} investor profiles`);

if (DRY_RUN) {
  console.log(`\nDry run — nothing deleted. Accounts that would go:`);
  for (const u of seeded.slice(0, 10)) console.log(`    ${u.email}`);
  if (seeded.length > 10) console.log(`    ...and ${seeded.length - 10} more`);
  console.log();
  process.exit(0);
}

// ── Delete ──────────────────────────────────────────────────────────────────
let removed = 0, failed = 0;
for (const u of seeded) {
  const r = await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H });
  if (r.ok) removed++;
  else { failed++; console.error(`  failed: ${u.email} (${r.status})`); }
}

// ── Prove the cascade actually fired ────────────────────────────────────────
const leftStartups = await count("startups", "owner_id", ids);
const leftInvestors = await count("investors", "owner_id", ids);

console.log(`\n  removed ${removed} accounts${failed ? `, ${failed} failed` : ""}`);
console.log(`  orphaned startups remaining:  ${leftStartups}`);
console.log(`  orphaned investors remaining: ${leftInvestors}`);
console.log(
  Number(leftStartups) === 0 && Number(leftInvestors) === 0
    ? "\nClean.\n"
    : "\nRows survived the cascade — investigate before assuming this is done.\n"
);
