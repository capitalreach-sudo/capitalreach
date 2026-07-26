#!/usr/bin/env node
// Populates a staging database with a realistic cross-section: 10 founders and
// 10 investors spread across every subscription tier, listings in every status,
// and deals in every pipeline stage.
//
// The tier spread is the point. Most bugs in this app are tier-gating bugs, and
// they only show up when you have an account on each plan to compare.
//
// Refuses to run against production. That guard is why this file is safe to
// keep in the repo.
//
//   node scripts/seed-staging.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_REF = "zhhcsnvkjkxexijiocly";
export const SEED_PASSWORD = "StagingSeed123!";

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
export const URL_ = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
export const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
export const ANON = process.env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL_ || !KEY) { console.error("Missing Supabase URL / service role key."); process.exit(2); }
if (URL_.includes(PRODUCTION_REF)) {
  console.error(`\nRefusing to run: ${URL_} is production. This creates fake users.\n`);
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (path, opts = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

// ── People ──────────────────────────────────────────────────────────────────
// Founder tiers: free | starter | growth.  Investor tiers: free | angel | pro_investor | institutional.

const FOUNDERS = [
  ["Aria Chen",       "free"],   ["Milo Fernandez",  "free"],
  ["Sana Okafor",     "starter"],["Tomas Brandt",    "starter"],
  ["Yuki Tanaka",     "starter"],["Priya Raman",     "growth"],
  ["Lars Dahl",       "growth"], ["Nadia Haddad",    "growth"],
  ["Owen Mbeki",      "free"],   ["Elise Moreau",    "starter"],
];

const INVESTORS = [
  ["Wren Adeyemi",   "free"],         ["Soren Vale",     "free"],
  ["Ines Duarte",    "angel"],        ["Kai Lindqvist",  "angel"],
  ["Ravi Menon",     "angel"],        ["Marta Kowalski", "pro_investor"],
  ["Theo Bassett",   "pro_investor"], ["Amara Diallo",   "pro_investor"],
  ["Jonas Reiter",   "institutional"],["Lucia Ferrari",  "institutional"],
];

const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const emailFor = (name, role) => `${role}.${slugify(name).split("-")[0]}@staging.test`;

async function upsertUser(email, name, role) {
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST", headers: H,
    body: JSON.stringify({ email, password: SEED_PASSWORD, email_confirm: true,
      user_metadata: { full_name: name, role } }),
  });
  if (res.ok) return (await res.json()).id;
  const list = await (await fetch(`${URL_}/auth/v1/admin/users?per_page=500`, { headers: H })).json();
  const found = (list.users || []).find(u => u.email === email);
  if (!found) throw new Error(`${email}: ${JSON.stringify(await res.json().catch(() => ({})))}`);
  return found.id;
}

const ids = {};

console.log(`Seeding ${URL_}\n`);

for (const [name, tier] of FOUNDERS) {
  const email = emailFor(name, "founder");
  const id = await upsertUser(email, name, "startup");
  ids[email] = id;
  await rest(`profiles?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ full_name: name, role: "startup", subscription_tier: tier,
      terms_accepted_at: new Date().toISOString() }) });
}
console.log(`  ${FOUNDERS.length} founders (free/starter/growth)`);

for (const [name, tier] of INVESTORS) {
  const email = emailFor(name, "investor");
  const id = await upsertUser(email, name, "investor");
  ids[email] = id;
  await rest(`profiles?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ full_name: name, role: "investor", subscription_tier: tier,
      terms_accepted_at: new Date().toISOString(),
      investor_declarations: { age_18_or_over: true, qualified_investor: true,
        own_due_diligence: true, risk_of_total_loss: true, declared_at: new Date().toISOString() },
      check_size_min: 25_000, check_size_max: 500_000,
      investment_thesis: "Backs technical founders solving unglamorous operational problems.",
      preferred_stages: ["pre-seed", "seed"], investor_type: "angel", portfolio_count: 7,
    }) });
}
console.log(`  ${INVESTORS.length} investors (free/angel/pro_investor/institutional)`);

const adminId = await upsertUser("admin@staging.test", "Staging Admin", "admin");
await rest(`profiles?id=eq.${adminId}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
  body: JSON.stringify({ full_name: "Staging Admin", role: "admin" }) });
console.log("  1 admin");

// ── Startups: one per founder, spread across status and stage ────────────────
const INDUSTRIES = ["Marketplace", "HealthTech", "FinTech", "B2B SaaS", "Climate / CleanTech",
                    "DeepTech", "E-commerce", "Cybersecurity", "AgriTech", "EdTech"];
const STAGES = ["pre-seed", "seed", "series_a", "series_b_plus"];
const STATUSES = ["active", "active", "active", "active", "active",
                  "active", "pending_review", "draft", "suspended", "active"];
const COUNTRIES = ["Germany", "Ireland", "France", "Netherlands", "Spain",
                   "Sweden", "Portugal", "Italy", "Poland", "Denmark"];

for (let i = 0; i < FOUNDERS.length; i++) {
  const [name, tier] = FOUNDERS[i];
  const email = emailFor(name, "founder");
  const company = ["Northwind Cargo","Halcyon Health","Ledgerly","Cadence Ops","Verdant Grid",
                   "Basalt Robotics","Peartree","Ironvale Security","Rootstock","Lumen Learning"][i];
  await rest("startups", { method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({
      owner_id: ids[email], name: company, slug: slugify(company),
      tagline: [
        "Freight routing that reprices itself every hour.",
        "Post-op recovery monitoring without the hospital bed.",
        "Reconciliation for finance teams who still live in spreadsheets.",
        "Shift scheduling for multi-site operations.",
        "Grid-balancing software for community solar.",
        "Warehouse robotics retrofit, no rip-and-replace.",
        "Returns logistics for mid-market e-commerce.",
        "Attack-surface monitoring for regulated SMEs.",
        "Soil analytics from existing farm machinery.",
        "Apprenticeship training that tracks to competency.",
      ][i],
      industry: INDUSTRIES[i], stage: STAGES[i % 4], country: COUNTRIES[i], city: "—",
      funding_target: [2_500_000, 750_000, 1_200_000, 900_000, 3_000_000,
                       5_000_000, 600_000, 1_800_000, 450_000, 1_100_000][i],
      equity_offered: [12.5, 8, 10, 9, 15, 18, 7, 11, 6, 9][i],
      min_check_size: 25_000,
      mrr: [47_000, 6_200, 22_000, 14_500, 31_000, 9_000, 18_000, 26_000, 3_100, 12_000][i],
      arr: [564_000, 74_400, 264_000, 174_000, 372_000, 108_000, 216_000, 312_000, 37_200, 144_000][i],
      user_count: [310, 41, 128, 96, 54, 22, 210, 73, 18, 140][i],
      growth_rate: [18.4, 31, 12.2, 9.8, 24.1, 41.3, 7.5, 15.9, 52.0, 11.1][i],
      runway_months: [14, 9, 18, 11, 22, 7, 16, 13, 5, 19][i],
      status: STATUSES[i], subscription_tier: tier,
      vaultrise_score: [82, 68, 74, 61, 79, 55, 70, 77, 48, 66][i],
      require_nda: i % 3 === 0,
      problem: "Incumbent workflows depend on manual steps that do not scale past a certain volume.",
      solution: "We automate the highest-friction step and settle the rest inside the platform.",
      market: "Mid-market European operators; a fragmented segment with no dominant vendor.",
    }) });
}
console.log(`  ${FOUNDERS.length} startups (5 active, 1 pending_review, 1 draft, 1 suspended)`);

// ── Investor profiles ───────────────────────────────────────────────────────
const INV_TYPES = ["angel", "vc", "family_office", "corporate"];
for (let i = 0; i < INVESTORS.length; i++) {
  const [name, tier] = INVESTORS[i];
  const email = emailFor(name, "investor");
  await rest("investors", { method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({
      owner_id: ids[email], slug: slugify(name), type: INV_TYPES[i % 4],
      display_name: name,
      firm_name: i % 2 === 0 ? null : ["Meridian Early","Ostgate","Cortile","Blue Fen","Silverbirch"][i % 5],
      bio: "Invests in operational software; prefers technical founders with domain scar tissue.",
      investment_thesis: "Unglamorous problems, measurable payback, short sales cycles.",
      industries: [INDUSTRIES[i % 10], INDUSTRIES[(i + 3) % 10]],
      stages: [STAGES[i % 4], STAGES[(i + 1) % 4]],
      geography: [COUNTRIES[i % 10], COUNTRIES[(i + 2) % 10]],
      min_check: [10_000, 25_000, 50_000, 100_000, 250_000][i % 5],
      max_check: [100_000, 250_000, 500_000, 1_000_000, 3_000_000][i % 5],
      subscription_tier: tier,
      lead_rounds: i % 3 === 0, number_of_investments: 4 + i * 3,
      aum: ["<1M", "1-5M", "5-25M", "25-100M", "100M+"][i % 5],
      avg_hold_period: ["3-5 years", "5-7 years", "7+ years"][i % 3],
      follow_on_policy: i % 2 === 0 ? "Reserves for follow-on" : "Single cheque",
      board_seat_pref: i % 3 === 0 ? "Observer" : "No seat",
    }) });
}
console.log(`  ${INVESTORS.length} investor profiles`);

// ── Deals across every stage ────────────────────────────────────────────────
const { data: sList } = { data: await (await rest("startups?select=id,slug&order=created_at")).json() };
const { data: iList } = { data: await (await rest("investors?select=id,slug&order=created_at")).json() };
const STATUS_CYCLE = ["intro", "due_diligence", "term_sheet", "closed", "passed"];

let dealCount = 0;
for (let i = 0; i < Math.min(sList.length, iList.length); i++) {
  const status = STATUS_CYCLE[i % 5];
  const res = await rest("deals", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      startup_id: sList[i].id, investor_id: iList[i].id,
      amount: [50_000, 100_000, 250_000, 500_000, 1_500_000][i % 5],
      currency: ["EUR", "USD", "GBP"][i % 3], status,
      ...(status === "closed" ? { closed_at: new Date().toISOString() } : {}),
      ...(status === "passed" ? { passed_at: new Date().toISOString() } : {}),
    }) });
  if (res.ok) dealCount++;
}
console.log(`  ${dealCount} deals across all 5 stages\n`);

console.log(`Password for every seeded account: ${SEED_PASSWORD}`);
console.log(`  founder.aria@staging.test      free tier`);
console.log(`  founder.priya@staging.test     growth tier`);
console.log(`  investor.wren@staging.test     free tier`);
console.log(`  investor.marta@staging.test    pro_investor`);
console.log(`  admin@staging.test             admin\n`);
