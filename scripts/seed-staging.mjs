#!/usr/bin/env node
// Populates a staging database with enough realistic data to actually exercise
// the app: two founders with live listings, two investors on different plans,
// and a deal in each pipeline stage.
//
// Refuses to run against the production project. That guard is the whole point
// of the file -- a seed script pointed at the wrong database is worse than no
// seed script.
//
//   node scripts/seed-staging.mjs          # seeds
//   node scripts/seed-staging.mjs --reset  # deletes seeded rows first

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Hard-coded so a mistyped env var cannot point this at real users.
const PRODUCTION_REF = "zhhcsnvkjkxexijiocly";

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

const env = { ...loadEnv(".env.local"), ...loadEnv(".env.staging") };
const URL_ = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error("Missing Supabase URL / service role key.");
  process.exit(2);
}

if (URL_.includes(PRODUCTION_REF)) {
  console.error(
    `\nRefusing to run: ${URL_} is the production project.\n` +
    `This script creates fake users and listings. Point it at staging.\n`
  );
  process.exit(1);
}

console.log(`Seeding ${URL_}\n`);

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (path, opts = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

// ── Accounts ────────────────────────────────────────────────────────────────
// Created through the auth admin API so they have real logins. The password is
// identical across seeded accounts on purpose -- this database is disposable.
const PASSWORD = "StagingSeed123!";

const PEOPLE = [
  { email: "founder.aria@staging.test",    name: "Aria Chen",      role: "startup"  },
  { email: "founder.milo@staging.test",    name: "Milo Fernandez", role: "startup"  },
  { email: "investor.wren@staging.test",   name: "Wren Adeyemi",   role: "investor", tier: "angel" },
  { email: "investor.soren@staging.test",  name: "Soren Vale",     role: "investor", tier: "pro_investor" },
  { email: "admin@staging.test",           name: "Staging Admin",  role: "admin"    },
];

async function createUser(p) {
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      email: p.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: p.name, role: p.role },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    // Already seeded — look the user up instead of failing the whole run.
    const list = await (await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: H })).json();
    const found = (list.users || []).find(u => u.email === p.email);
    if (found) return found.id;
    throw new Error(`${p.email}: ${JSON.stringify(body)}`);
  }
  return body.id;
}

const ids = {};
for (const p of PEOPLE) {
  ids[p.email] = await createUser(p);
  // The handle_new_user trigger creates the profile row; set the tier after.
  await rest(`profiles?id=eq.${ids[p.email]}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      full_name: p.name,
      role: p.role,
      subscription_tier: p.tier ?? "free",
      terms_accepted_at: new Date().toISOString(),
    }),
  });
  console.log(`  user   ${p.email.padEnd(32)} ${p.role}`);
}

// ── Startups ────────────────────────────────────────────────────────────────
const STARTUPS = [
  {
    owner: "founder.aria@staging.test",
    name: "Northwind Cargo", slug: "northwind-cargo",
    tagline: "Freight routing that reprices itself every hour.",
    industry: "Marketplace", stage: "seed", country: "Germany", city: "Berlin",
    funding_target: 2_500_000, equity_offered: 12.5, min_check_size: 50_000,
    mrr: 47_000, arr: 564_000, user_count: 310, growth_rate: 18.4, runway_months: 14,
    status: "active", subscription_tier: "growth", vaultrise_score: 82,
    problem: "Freight brokers still quote from static rate sheets that go stale within a day.",
    solution: "We reprice every lane hourly from live capacity signals and settle in-platform.",
    market: "European road freight brokerage, roughly 180bn EUR of annual spend.",
  },
  {
    owner: "founder.milo@staging.test",
    name: "Halcyon Health", slug: "halcyon-health",
    tagline: "Post-op recovery monitoring without the hospital bed.",
    industry: "HealthTech", stage: "pre-seed", country: "Ireland", city: "Dublin",
    funding_target: 750_000, equity_offered: 8, min_check_size: 25_000,
    mrr: 6_200, arr: 74_400, user_count: 41, growth_rate: 31.0, runway_months: 9,
    status: "active", subscription_tier: "starter", vaultrise_score: 68,
    problem: "Readmissions after day surgery are driven by gaps in the first 72 hours at home.",
    solution: "A wearable plus triage workflow that escalates to a clinician before readmission.",
    market: "EU day-surgery volume is about 22m procedures a year.",
  },
];

for (const s of STARTUPS) {
  const { owner, ...row } = s;
  const res = await rest("startups", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({ ...row, owner_id: ids[owner] }),
  });
  const [created] = await res.json().catch(() => [null]);
  if (created) ids[s.slug] = created.id;
  console.log(`  startup ${s.name.padEnd(31)} ${s.status}`);
}

// ── Investors ───────────────────────────────────────────────────────────────
const INVESTORS = [
  {
    owner: "investor.wren@staging.test", slug: "wren-adeyemi", type: "angel",
    display_name: "Wren Adeyemi", min_check: 25_000, max_check: 150_000,
    industries: ["HealthTech", "Marketplace"], stages: ["pre-seed", "seed"],
    geography: ["Ireland", "United Kingdom"], subscription_tier: "angel",
    bio: "Operator-turned-angel. Two exits in clinical workflow software.",
  },
  {
    owner: "investor.soren@staging.test", slug: "soren-vale", type: "vc",
    display_name: "Soren Vale", firm_name: "Meridian Early", min_check: 250_000, max_check: 2_000_000,
    industries: ["Marketplace", "B2B SaaS"], stages: ["seed", "series_a"],
    geography: ["Germany", "Netherlands"], subscription_tier: "pro_investor",
    bio: "Seed-stage fund focused on logistics and industrial software.",
  },
];

for (const i of INVESTORS) {
  const { owner, ...row } = i;
  const res = await rest("investors", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({ ...row, owner_id: ids[owner] }),
  });
  const [created] = await res.json().catch(() => [null]);
  if (created) ids[i.slug] = created.id;
  console.log(`  investor ${i.display_name.padEnd(30)} ${i.subscription_tier}`);
}

// ── Deals, one per pipeline stage ───────────────────────────────────────────
const DEALS = [
  { startup: "northwind-cargo", investor: "soren-vale",   amount: 1_500_000, status: "term_sheet" },
  { startup: "northwind-cargo", investor: "wren-adeyemi", amount:   100_000, status: "due_diligence" },
  { startup: "halcyon-health",  investor: "wren-adeyemi", amount:    50_000, status: "intro" },
];

for (const d of DEALS) {
  if (!ids[d.startup] || !ids[d.investor]) continue;
  await rest("deals", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      startup_id: ids[d.startup], investor_id: ids[d.investor],
      amount: d.amount, currency: "EUR", status: d.status,
    }),
  });
  console.log(`  deal    ${d.startup} x ${d.investor} (${d.status})`);
}

console.log(`\nDone. Sign in with any seeded address, password: ${PASSWORD}`);
console.log("  founder.aria@staging.test    founder, Growth plan");
console.log("  investor.soren@staging.test  investor, Pro plan");
console.log("  admin@staging.test           admin\n");
