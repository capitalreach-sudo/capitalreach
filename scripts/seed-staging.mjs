#!/usr/bin/env node
// Populates a staging database with a realistic cross-section: 30 founders and
// 29 investors spread across every subscription tier, listings in every status,
// and deals in every pipeline stage.
//
// Sized for demoing as much as for testing -- a marketplace with three listings
// in it does not read as a marketplace. Most listings are therefore `active`,
// with three deliberately left in pending_review / draft / suspended so the
// admin review queue has something in it.
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

// First names must stay unique across each list -- emailFor() keys off the
// first word, so two "Anna"s would collide onto one account.
const FOUNDERS = [
  ["Aria Chen",       "free"],   ["Milo Fernandez",  "free"],
  ["Sana Okafor",     "starter"],["Tomas Brandt",    "starter"],
  ["Yuki Tanaka",     "starter"],["Priya Raman",     "growth"],
  ["Lars Dahl",       "growth"], ["Nadia Haddad",    "growth"],
  ["Owen Mbeki",      "free"],   ["Elise Moreau",    "starter"],
  // ── added for the demo dataset ──
  ["Freya Lindholm",  "growth"], ["Idris Bello",     "starter"],
  ["Mei Ling Zhou",   "free"],   ["Rafael Ortega",   "growth"],
  ["Ingrid Solberg",  "starter"],["Omar Haddadi",    "free"],
  ["Beatriz Salgado", "growth"], ["Niko Virtanen",   "starter"],
  ["Saoirse Byrne",   "free"],   ["Dmitri Volkov",   "starter"],
  ["Anouk Visser",    "growth"], ["Tariq Nasser",    "free"],
  ["Lena Hartmann",   "starter"],["Kwame Asante",    "growth"],
  ["Sofia Marchetti", "starter"],["Henrik Nilsen",   "free"],
  ["Amina Cherif",    "growth"], ["Viktor Novak",    "starter"],
  ["Clara Behrens",   "free"],   ["Joon Park",       "growth"],
];

const INVESTORS = [
  ["Wren Adeyemi",   "free"],         ["Soren Vale",     "free"],
  ["Ines Duarte",    "angel"],        ["Kai Lindqvist",  "angel"],
  ["Ravi Menon",     "angel"],        ["Marta Kowalski", "pro_investor"],
  ["Theo Bassett",   "pro_investor"], ["Amara Diallo",   "pro_investor"],
  ["Jonas Reiter",   "institutional"],["Lucia Ferrari",  "institutional"],
  // ── added for the demo dataset ──
  ["Halvard Ness",   "angel"],        ["Celia Rousseau", "pro_investor"],
  ["Bo Andersen",    "free"],         ["Rustam Aliyev",  "angel"],
  ["Maren Kohl",     "institutional"],["Ezra Feldman",   "pro_investor"],
  ["Delphine Roy",   "angel"],        ["Anders Berg",    "institutional"],
  ["Yara Khoury",    "pro_investor"], ["Pilar Navarro",  "angel"],
  ["Emeka Obi",      "free"],         ["Sigrid Holm",    "institutional"],
  ["Matteo Bianchi", "pro_investor"], ["Noor Rahman",    "angel"],
  ["Casper Vos",     "free"],         ["Rhian Pryce",    "pro_investor"],
  ["Aleksy Zielin",  "angel"],        ["Tova Lindgren",  "institutional"],
  ["Malik Diarra",   "pro_investor"],
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
// Mostly active so the marketplace actually looks populated in a demo. The
// three non-active ones are kept deliberately: they are what makes the admin
// review queue and the suspended-listing states demonstrable.
const STATUSES = [
  "active", "active", "active", "active", "active",
  "active", "pending_review", "draft", "suspended", "active",
  ...Array(20).fill("active"),
];
const COUNTRIES = ["Germany", "Ireland", "France", "Netherlands", "Spain",
                   "Sweden", "Portugal", "Italy", "Poland", "Denmark"];

const COMPANIES = [
  "Northwind Cargo","Halcyon Health","Ledgerly","Cadence Ops","Verdant Grid",
  "Basalt Robotics","Peartree","Ironvale Security","Rootstock","Lumen Learning",
  "Tidewell","Kestrel Freight","Umbra Health","Palladio","Stonecrop",
  "Wayfarer Labs","Brightmoor","Ferrous","Quaywise","Aldergate",
  "Marloe","Northrail","Emberline","Cintra Works","Saltmarsh",
  "Girder","Oxbow Analytics","Pennyfarthing","Vellum","Harrowgate",
];

const TAGLINES = [
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
  "Tidal forecasting for port scheduling teams.",
  "Last-mile consolidation for regional carriers.",
  "Triage routing for out-of-hours clinics.",
  "Procurement approvals that survive an audit.",
  "Crop rotation planning from satellite imagery.",
  "Field-service dispatch for utilities contractors.",
  "Tenant billing for mixed-use property managers.",
  "Alloy sourcing and traceability for foundries.",
  "Berth allocation for inland waterway freight.",
  "Case management for immigration practices.",
  "Cold-chain telemetry for pharmaceutical hauliers.",
  "Track maintenance scheduling for rail operators.",
  "Demand forecasting for district heating networks.",
  "Quality inspection from existing factory cameras.",
  "Coastal flood modelling for insurers.",
  "Structural load monitoring for bridge owners.",
  "Water loss detection across municipal networks.",
  "Route planning for bike-based urban logistics.",
  "Contract abstraction for in-house legal teams.",
  "Waste stream sorting analytics for recyclers.",
];

// The financial arrays below are ten entries long and were previously indexed
// straight by position, which produced `undefined` past the tenth founder.
// They now cycle -- but cycling alone would give startups 1, 11 and 21
// identical revenue and headcount, which reads as obviously fabricated. `vary`
// applies a deterministic offset per row so the repeats diverge while the
// dataset stays reproducible between runs.
const pick = (arr, i) => arr[i % arr.length];
const vary = (n, i, spread = 0.35) => n * (1 + ((((i * 37) % 100) / 100) - 0.5) * spread * 2);
const round = (n, to) => Math.max(to, Math.round(n / to) * to);

const FUNDING = [2_500_000, 750_000, 1_200_000, 900_000, 3_000_000,
                 5_000_000, 600_000, 1_800_000, 450_000, 1_100_000];
const EQUITY  = [12.5, 8, 10, 9, 15, 18, 7, 11, 6, 9];
const MRR     = [47_000, 6_200, 22_000, 14_500, 31_000, 9_000, 18_000, 26_000, 3_100, 12_000];
const USERS   = [310, 41, 128, 96, 54, 22, 210, 73, 18, 140];
const GROWTH  = [18.4, 31, 12.2, 9.8, 24.1, 41.3, 7.5, 15.9, 52.0, 11.1];
const RUNWAY  = [14, 9, 18, 11, 22, 7, 16, 13, 5, 19];
const SCORES  = [82, 68, 74, 61, 79, 55, 70, 77, 48, 66];

if (COMPANIES.length !== FOUNDERS.length || TAGLINES.length !== FOUNDERS.length) {
  throw new Error(
    `Data length mismatch: ${FOUNDERS.length} founders, ${COMPANIES.length} companies, ${TAGLINES.length} taglines`
  );
}

for (let i = 0; i < FOUNDERS.length; i++) {
  const [name, tier] = FOUNDERS[i];
  const email = emailFor(name, "founder");
  const company = COMPANIES[i];
  await rest("startups", { method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({
      owner_id: ids[email], name: company, slug: slugify(company),
      tagline: TAGLINES[i],
      industry: pick(INDUSTRIES, i), stage: STAGES[i % 4], country: pick(COUNTRIES, i), city: "—",
      funding_target: round(vary(pick(FUNDING, i), i), 50_000),
      equity_offered: Number(vary(pick(EQUITY, i), i + 1).toFixed(1)),
      min_check_size: 25_000,
      mrr: round(vary(pick(MRR, i), i + 2), 100),
      arr: round(vary(pick(MRR, i), i + 2) * 12, 1000),
      user_count: Math.max(5, Math.round(vary(pick(USERS, i), i + 3))),
      growth_rate: Number(vary(pick(GROWTH, i), i + 4).toFixed(1)),
      runway_months: Math.max(3, Math.round(vary(pick(RUNWAY, i), i + 5))),
      status: STATUSES[i], subscription_tier: tier,
      vaultrise_score: Math.min(96, Math.max(38, Math.round(vary(pick(SCORES, i), i + 6, 0.18)))),
      require_nda: i % 3 === 0,
      problem: "Incumbent workflows depend on manual steps that do not scale past a certain volume.",
      solution: "We automate the highest-friction step and settle the rest inside the platform.",
      market: "Mid-market European operators; a fragmented segment with no dominant vendor.",
    }) });
}
console.log(`  ${FOUNDERS.length} startups (${STATUSES.slice(0, FOUNDERS.length).filter(s => s === "active").length} active, 1 pending_review, 1 draft, 1 suspended)`);

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

// The 1:1 pass above gives every investor exactly one deal, which makes for a
// thin-looking board when you open the Deal Portal in a demo. Give the first
// three investors a full pipeline instead. Skips pairs that already exist so
// the unique(startup, investor) shape of the data is preserved on re-runs.
for (let inv = 0; inv < Math.min(3, iList.length); inv++) {
  for (let n = 1; n <= 5; n++) {
    const s = sList[(inv + n * 7) % sList.length];
    if (!s || s.id === sList[inv]?.id) continue;
    const status = STATUS_CYCLE[(inv + n) % 5];
    const res = await rest("deals", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        startup_id: s.id, investor_id: iList[inv].id,
        amount: [75_000, 150_000, 300_000, 600_000, 2_000_000][n % 5],
        currency: ["EUR", "USD", "GBP"][n % 3], status,
        ...(status === "closed" ? { closed_at: new Date().toISOString() } : {}),
        ...(status === "passed" ? { passed_at: new Date().toISOString() } : {}),
      }) });
    if (res.ok) dealCount++;
  }
}
console.log(`  ${dealCount} deals across all 5 stages\n`);

console.log(`Password for every seeded account: ${SEED_PASSWORD}`);
console.log(`  founder.aria@staging.test      free tier`);
console.log(`  founder.priya@staging.test     growth tier`);
console.log(`  investor.wren@staging.test     free tier`);
console.log(`  investor.marta@staging.test    pro_investor`);
console.log(`  admin@staging.test             admin\n`);
