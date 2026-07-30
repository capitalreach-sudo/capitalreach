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

// With --production, read the production env explicitly instead of relying on
// whatever .env.local happens to point at. Swapping env files around by hand to
// aim this script is exactly how you seed the wrong database.
const env = process.argv.includes("--production")
  ? loadEnv(".env.local.production-backup")
  : { ...loadEnv(".env.local"), ...loadEnv(".env.staging") };
export const URL_ = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
export const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
export const ANON = process.env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL_ || !KEY) { console.error("Missing Supabase URL / service role key."); process.exit(2); }
// Production requires an explicit flag rather than no guard at all. Seeding
// production creates real auth users and publicly visible listings; that should
// never be something a stray `npm run seed` can do by accident.
//
// Every account created here uses an @staging.test address, which is what
// scripts/unseed.mjs keys off to remove them again. Do not change that suffix
// without changing the teardown to match.
const ALLOW_PRODUCTION = process.argv.includes("--production");
if (URL_.includes(PRODUCTION_REF) && !ALLOW_PRODUCTION) {
  console.error(`\nRefusing to run: ${URL_} is production. This creates fake users.`);
  console.error(`If that is genuinely what you want, re-run with --production.\n`);
  process.exit(1);
}
if (URL_.includes(PRODUCTION_REF)) {
  console.warn(`\n!!  Seeding PRODUCTION with demo data.`);
  console.warn(`!!  These listings will be publicly visible on the live site.`);
  console.warn(`!!  Remove them with: node scripts/unseed.mjs --production\n`);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (path, opts = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

// Writes used to be fire-and-forget, which hid a real bug for several runs: the
// upserts below were 409-ing on the unique slug every time and nobody noticed,
// so re-running the seed silently refused to update any row that already
// existed. Surface failures instead of assuming success.
const failures = [];
async function write(path, opts, label) {
  const res = await rest(path, opts);
  if (!res.ok) failures.push(`${label}: ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res;
}

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
  // on_conflict=slug is load-bearing. Without naming the conflict target
  // PostgREST upserts against the primary key, and since no id is supplied
  // that degrades to a plain insert which 409s on the unique slug -- meaning
  // re-running the seed never refreshed an existing listing.
  await write(`startups?on_conflict=slug`, { method: "POST",
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
      // Without these two the profile-completion meter sits at 45% and the
      // dashboard nags about them, which reads as a half-finished listing.
      competitive_advantage:
        "Deploys against existing systems rather than replacing them, so time-to-value is weeks rather than quarters.",
      use_of_funds:
        "60% engineering, 25% go-to-market in DACH and Benelux, 15% working capital.",
    }) }, `startup ${company}`);
}
console.log(`  ${FOUNDERS.length} startups (${STATUSES.slice(0, FOUNDERS.length).filter(s => s === "active").length} active, 1 pending_review, 1 draft, 1 suspended)`);

// ── Investor profiles ───────────────────────────────────────────────────────
const INV_TYPES = ["angel", "vc", "family_office", "corporate"];
for (let i = 0; i < INVESTORS.length; i++) {
  const [name, tier] = INVESTORS[i];
  const email = emailFor(name, "investor");
  await write(`investors?on_conflict=slug`, { method: "POST",
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
    }) }, `investor ${name}`);
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

// ── Founders, saves and conversations ───────────────────────────────────────
// Without these, a startup page shows "Team information not provided" and
// "No documents uploaded yet" on two of its five tabs, the founder dashboard
// reads 0 views and 0 saves, and the inbox is empty -- so three of the
// product's features look broken rather than unused.

const FOUNDER_ROLES = ["Co-founder & CEO", "Co-founder & CTO", "Co-founder & COO"];
const FIRST = ["Elin", "Marcus", "Yara", "Tomas", "Ada", "Nils", "Rosa", "Hugo", "Iris", "Petr"];
const LAST  = ["Sandberg", "Okonkwo", "Ferreira", "Novak", "Lindgren", "Bauer", "Costa", "Meier"];

let founderRows = 0;
for (let i = 0; i < sList.length; i++) {
  const s = sList[i];
  const existing = await (await rest(`startup_founders?select=id&startup_id=eq.${s.id}`)).json();
  if (Array.isArray(existing) && existing.length > 0) continue;   // idempotent
  const n = 2 + (i % 2);                                          // two or three founders
  for (let k = 0; k < n; k++) {
    const name = `${FIRST[(i + k * 3) % FIRST.length]} ${LAST[(i + k * 5) % LAST.length]}`;
    const r = await write("startup_founders", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        startup_id: s.id, name, role: FOUNDER_ROLES[k],
        linkedin_url: `https://linkedin.com/in/${slugify(name)}`,
      }) }, `founder ${name}`);
    if (r.ok) founderRows++;
  }
}
console.log(`  ${founderRows} founders across ${sList.length} startups`);

// Watchlist saves — makes the investor's watchlist and the founder's "investor
// saves" counter non-zero. Unique(investor_id, startup_id) makes this safe to
// re-run.
let saves = 0;
for (let i = 0; i < iList.length; i++) {
  for (let k = 0; k < 4; k++) {
    const s = sList[(i * 3 + k * 5) % sList.length];
    const r = await rest("watchlists?on_conflict=investor_id,startup_id", { method: "POST",
      headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify({ investor_id: iList[i].id, startup_id: s.id }) });
    if (r.ok) saves++;
  }
}
console.log(`  ${saves} watchlist saves`);

// Conversations. One per deal for the first handful, with a short exchange so
// the inbox has something to open rather than an empty state.
const OPENERS = [
  "Saw the listing — the retrofit angle is what caught my eye. Are you replacing or augmenting existing WMS?",
  "Interesting traction for the stage. What does churn look like on the mid-market accounts?",
  "We've looked at two companies in this space this quarter. What's your wedge against the incumbents?",
  "Happy to take a closer look. Do you have a data room we can access under NDA?",
];
const REPLIES = [
  "Augmenting — we sit on top of the existing WMS, which is why deployment is weeks not quarters. Happy to walk you through it.",
  "Logo churn is under 3% annually; net revenue retention is 118% on the accounts past twelve months.",
  "Deployment time, mostly. Incumbents need a rip-and-replace; we don't. That's the whole pitch.",
  "Yes — I can share it once the NDA is signed. Want me to send it through the platform?",
];

let threads = 0, msgs = 0;
for (let i = 0; i < Math.min(8, iList.length); i++) {
  const s = sList[(i * 3) % sList.length];
  const inv = iList[i];
  const tRes = await rest("threads?on_conflict=startup_id,investor_id", { method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({ startup_id: s.id, investor_id: inv.id, status: i % 3 === 0 ? "due_diligence" : "active" }) });
  if (!tRes.ok) continue;
  const [thread] = await tRes.json();
  threads++;

  const existingMsgs = await (await rest(`messages?select=id&thread_id=eq.${thread.id}`)).json();
  if (Array.isArray(existingMsgs) && existingMsgs.length > 0) continue;

  const startupOwner = await (await rest(`startups?select=owner_id&id=eq.${s.id}`)).json();
  const invOwner = await (await rest(`investors?select=owner_id&id=eq.${inv.id}`)).json();
  const pairs = [
    { sender: invOwner[0]?.owner_id,     body: OPENERS[i % OPENERS.length] },
    { sender: startupOwner[0]?.owner_id, body: REPLIES[i % REPLIES.length] },
  ];
  for (const m of pairs) {
    if (!m.sender) continue;
    const r = await write("messages", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ thread_id: thread.id, sender_id: m.sender, body: m.body }) }, "message");
    if (r.ok) msgs++;
  }
}
console.log(`  ${threads} conversations, ${msgs} messages\n`);

if (failures.length) {
  console.error(`\n!!  ${failures.length} write(s) failed — the data is incomplete:`);
  for (const f of failures.slice(0, 10)) console.error(`      ${f}`);
  if (failures.length > 10) console.error(`      ...and ${failures.length - 10} more`);
  console.error("");
}

console.log(`Password for every seeded account: ${SEED_PASSWORD}`);
console.log(`  founder.aria@staging.test      free tier`);
console.log(`  founder.priya@staging.test     growth tier`);
console.log(`  investor.wren@staging.test     free tier`);
console.log(`  investor.marta@staging.test    pro_investor`);
console.log(`  admin@staging.test             admin\n`);
